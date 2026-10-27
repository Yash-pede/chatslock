/**
 * Replica of the app's WebSocket lifecycle against the deployed API, so the
 * server side can be checked from a terminal without the phone.
 *
 * Usage (Node 22+):
 *   node scripts/ws-probe.mjs <accessToken>
 *
 * It runs the exact handshake the app performs (`?token=<jwt>`), then exercises
 * `ping`, `list`, `send` and reports what actually comes back. Exit code is
 * non-zero when the socket never opens or a request goes unanswered.
 */
const WS_URL = process.env.WS_URL ?? "wss://ws.chatslock.com"

const token = process.argv[2]

if (!token) {
  console.error("usage: node scripts/ws-probe.mjs <accessToken>")
  process.exit(2)
}

const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const started = Date.now()
let opened = false
const elapsed = () => `${String(Date.now() - started).padStart(5)}ms`

const url = `${WS_URL}?token=${encodeURIComponent(token)}`
const socket = new WebSocket(url)

/** Pending correlated requests: clientId -> {op, resolve, reject, timer}. */
const pending = new Map()

const close = (code = 0) => {
  try {
    socket.close()
  } catch {
    // already closed
  }
  process.exit(code)
}

const request = (op, data, timeoutMs = 8_000) =>
  new Promise((resolve, reject) => {
    const clientId = newRequestId()
    const timer = setTimeout(() => {
      pending.delete(clientId)
      reject(new Error(`${op} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    pending.set(clientId, { op, resolve, reject, timer })
    // `ping` uses the mock `system` route; everything else is a `message` op.
    const payload =
      op === "ping" ? { action: "system" } : { action: "message", op, data: { ...data, clientId } }
    console.log(`${elapsed()} -> ${JSON.stringify(payload)}`)
    socket.send(JSON.stringify(payload))
  })

socket.onopen = () => {
  opened = true
  console.log(`${elapsed()} OPEN  handshake accepted (authorizer + $connect returned 2xx)`)
  run().then(
    () => close(0),
    (error) => {
      console.error(`${elapsed()} FAIL  ${error.message}`)
      close(1)
    },
  )
}

socket.onmessage = (event) => {
  const raw = typeof event.data === "string" ? event.data : "<binary>"
  console.log(`${elapsed()} <- ${raw.slice(0, 300)}`)

  let frame
  try {
    frame = JSON.parse(raw)
  } catch {
    return
  }
  const entry = frame?.clientId ? pending.get(frame.clientId) : undefined
  if (!entry) return
  clearTimeout(entry.timer)
  pending.delete(frame.clientId)
  if (frame.type === "error") entry.reject(new Error(`${entry.op}: ${frame.message}`))
  else entry.resolve(frame)
}

socket.onerror = () => console.log(`${elapsed()} ERROR transport error`)

socket.onclose = (event) => {
  clearTimeout(openTimer)
  const why = `${elapsed()} CLOSE code=${event.code} reason=${event.reason || "-"}`
  if (!opened) {
    console.error(
      `${elapsed()} FAIL  handshake refused (authorizer DENY, $connect non-2xx, or wrong URL)`,
    )
    close(1)
    return
  }
  if (pending.size > 0) {
    console.error(`${why} while ${pending.size} request(s) pending`)
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(`${entry.op} interrupted by close ${event.code}`))
      pending.delete(id)
    }
    return
  }
  console.log(why)
}

/** Handshake watchdog: the gateway must answer the upgrade quickly. */
const openTimer = setTimeout(() => {
  console.error(`${elapsed()} FAIL  no upgrade within 10s (authorizer/$connect hanging)`)
  close(1)
}, 10_000)
socket.addEventListener("open", () => clearTimeout(openTimer))

async function run() {
  // 1. Heartbeat (`system` route, mock integration on the gateway).
  const pingStart = Date.now()
  await request("ping", {})
  console.log(`${elapsed()} OK    ping answered in ${Date.now() - pingStart}ms`)

  // 2. History over the socket (cursor paging).
  const conversationId = process.argv[3]
  if (!conversationId) {
    console.log(`${elapsed()} SKIP  list/send (pass a conversation id as 2nd arg)`)
    return
  }

  const page = await request("list", { conversationId, limit: 5 })
  console.log(`${elapsed()} OK    list returned ${(page.messages ?? []).length} message(s)`)

  // 3. Send: proves the ack path and that fan-out does not break the socket.
  const body = `probe ${new Date().toISOString()}`
  const sent = await request("send", { conversationId, type: "TEXT", body })
  console.log(`${elapsed()} OK    send acked messageId=${sent.message?.messageId}`)
}
