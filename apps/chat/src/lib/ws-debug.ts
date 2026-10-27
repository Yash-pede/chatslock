/**
 * One switch for seeing every WebSocket frame the app sends and receives.
 *
 * Flip `WS_DEBUG` to `false` (or comment the `console.log` in `log`) to silence
 * it — nothing else needs changing. The logger is wired into `WsClient`, which
 * sees frames before parsing (inbound) and at the single `send()` choke point
 * (outbound), so it also covers pings, acks, errors and pushes.
 *
 * Nothing here touches production behaviour: it only formats already-sent /
 * already-received data.
 */

/**
 * The one switch: true logs every frame in both directions. Flip to false (or
 * comment the `console.log` in `log`) to turn it off. Frames are printed as
 * `→ [ws] 10:31:12.481 {...}` (sent) and `← [ws] 10:31:12.502 {...}` (received),
 * so you can filter logcat by `[ws]` and grep by arrow.
 */
export const WS_DEBUG = true

const OUT = "→"
const IN = "←"

const isHeartbeat = (payload: unknown) =>
  typeof payload === "object" &&
  payload !== null &&
  (payload as { action?: string }).action === "system"

/** Short, readable rendering: small JSON stays inline, big payloads are capped. */
const render = (payload: unknown, maxLength = 600): string => {
  let text: string
  if (typeof payload === "string") {
    text = payload
  } else {
    try {
      text = JSON.stringify(payload)
    } catch {
      text = String(payload)
    }
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}… (${text.length} chars)` : text
}

/** Clock with milliseconds: enough to line frames up with Lambda logs. */
const stamp = () => {
  const now = new Date()
  return `${now.toISOString().slice(11, 23)}`
}

function log(direction: typeof OUT | typeof IN, payload: unknown) {
  if (!WS_DEBUG) return
  console.log(`${direction} [ws] ${stamp()} ${render(payload)}`)
}

export const wsTraffic = {
  /** A frame the client is about to write to the socket. */
  outbound(payload: unknown) {
    // Heartbeats would otherwise dominate the log; they are the only frames
    // worth hiding by default.
    if (isHeartbeat(payload)) return
    log(OUT, payload)
  },
  /** A raw frame the server delivered (before JSON parsing). */
  inbound(raw: unknown) {
    log(IN, raw)
  },
  /** Lifecycle line (connect / close), tagged so it is easy to filter out. */
  event(name: string, detail?: Record<string, unknown>) {
    if (!WS_DEBUG) return
    console.log(`${IN} [ws] ${stamp()} ${name}${detail ? ` ${render(detail, 300)}` : ""}`)
  },
}
