import { WS_EVENT_TYPE, WS_SYSTEM_ACTION } from "@repo/types/schema"
import { wsTraffic } from "./ws-debug"

/** Status the app and its logging care about. */
export type WsStatus = "connecting" | "connected" | "reconnecting"
export type WsFrame = { type?: string; clientId?: string; [key: string]: unknown }

/** The slice of the WebSocket API this client relies on. */
export interface SocketLike {
  readyState: number
  send: (data: string) => void
  close: () => void
  onopen: (() => void) | null
  onclose: ((event?: { code?: number; reason?: string }) => void) | null
  onerror: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
}

export interface WsClientOptions {
  /** Opens a socket (with a fresh token), or `null` when there is no token yet. */
  open: () => SocketLike | null
  onStatusChange: (status: WsStatus) => void
  /** Any well-formed frame from the server. */
  onFrame: (frame: WsFrame) => void
  /** A frame the server sent before the socket was usable (reject reason). */
  onRejected?: (frame: WsFrame) => void
  /** A previously open socket closed (offline toast). */
  onDropped?: () => void
  /** Why a socket ended, for diagnostics. */
  onClosed?: (info: { code: number; reason: string; wasOpen: boolean; retryInMs: number }) => void
}

/** Handshake must complete within this; API Gateway answers in well under a second. */
const OPEN_TIMEOUT_MS = 10_000
/** Ping cadence and how long its ack may take before the socket is dead. */
const PING_INTERVAL_MS = 20_000
const PONG_TIMEOUT_MS = 8_000
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 20_000

/**
 * One websocket, with a single rule set:
 *
 * 1. `connect()` opens a socket and arms an open-timeout. Anything that ends
 *    that socket before it opens is a failure (the gateway refused it).
 * 2. Once open, a liveness ping every `PING_INTERVAL_MS` must be answered within
 *    `PONG_TIMEOUT_MS` (any frame counts as proof of life). The ping uses the
 *    `system` route, which API Gateway answers itself (MOCK) — it never
 *    invokes the Lambda, so it cannot fail with a 5xx.
 * 3. Every end — failed handshake, network close, foreground reconnect — goes
 *    through `end()` exactly once, with exponential backoff.
 *
 * There is no other timer and no second reconnect path, so a socket can never
 * be opened twice and a close can never be swallowed.
 */
export class WsClient {
  private socket: SocketLike | null = null
  private opened = false
  private attempts = 0
  private openTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closingCode = 1006
  private closingReason = ""
  private disposed = false
  private readonly options: WsClientOptions

  constructor(options: WsClientOptions) {
    this.options = options
  }

  get isOpen(): boolean {
    return this.socket?.readyState === 1
  }

  /** True while a socket exists (opening or open). */
  get isActive(): boolean {
    return this.socket !== null
  }

  /** Opens a socket. No-op while one already exists. */
  connect(): void {
    if (this.disposed || this.socket) return

    this.clearReconnect()
    const socket = this.options.open()
    if (!socket) return

    this.socket = socket
    this.opened = false
    this.closingCode = 1006
    this.closingReason = ""
    this.options.onStatusChange(this.attempts === 0 ? "connecting" : "reconnecting")

    socket.onopen = () => {
      this.opened = true
      this.attempts = 0
      this.clearOpenTimer()
      this.options.onStatusChange("connected")
      this.startPing()
    }
    socket.onmessage = (event) => this.handleFrame(event.data)
    socket.onerror = () => {
      this.closingReason = "socket-error"
      socket.close()
    }
    socket.onclose = (event) => {
      // Ignore the close of a socket we already tore down (`end()` ran first).
      if (this.socket !== socket) return
      this.closingCode = event?.code ?? 1006
      this.closingReason = event?.reason ?? this.closingReason
      this.end()
    }

    this.openTimer = setTimeout(() => {
      this.closingReason = "open-timeout"
      // A handshake that never settles is as dead as one that was refused.
      this.end()
      socket.close()
    }, OPEN_TIMEOUT_MS)
  }

  /**
   * Reconnects immediately (app foregrounded). A socket that never finished its
   * handshake is left alone: it is still valid and closing it only adds a
   * discarded `$connect`. Only an open socket is replaced, so the new one gets
   * a fresh token after a long background stay.
   */
  reconnectNow(): void {
    if (this.disposed) return
    this.attempts = 0
    const socket = this.socket
    if (!socket) {
      this.connect()
      return
    }
    if (!this.opened) return
    this.closingReason = "reconnect-now"
    this.end()
    socket.close()
  }

  /** Sends a frame; false when the socket is not open. */
  send(frame: { action: string; op?: string; data?: unknown }): boolean {
    if (!this.isOpen || !this.socket) return false
    // Every outgoing frame goes through here: the one place to log them.
    wsTraffic.outbound(frame)
    this.socket.send(JSON.stringify(frame))
    return true
  }

  dispose(): void {
    this.disposed = true
    this.clearAllTimers()
    const socket = this.socket
    this.socket = null
    this.opened = false
    socket?.close()
  }

  // ---- internals ----

  /** Single teardown path: every close, timeout and error lands here. */
  private end(): void {
    if (!this.socket) return

    const wasOpen = this.opened
    this.socket = null
    this.opened = false
    this.clearOpenTimer()
    this.stopPing()

    if (this.disposed) return

    this.attempts += 1
    const retryInMs = Math.min(RECONNECT_MIN_MS * 2 ** (this.attempts - 1), RECONNECT_MAX_MS)
    this.options.onStatusChange("reconnecting")
    this.options.onClosed?.({
      code: this.closingCode,
      reason: this.closingReason,
      wasOpen,
      retryInMs,
    })
    if (wasOpen) this.options.onDropped?.()
    wsTraffic.event(wasOpen ? "closed" : "closed before opening", {
      code: this.closingCode,
      reason: this.closingReason || undefined,
      retryInMs,
    })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, retryInMs)
  }

  private handleFrame(data: unknown): void {
    if (typeof data !== "string") return
    // Raw inbound frame, before parsing, so malformed ones show up too.
    wsTraffic.inbound(data)

    let frame: WsFrame
    try {
      frame = JSON.parse(data) as WsFrame
    } catch {
      return
    }
    if (typeof frame?.type !== "string") return

    // Server reject notice for a handshake that never opened (or the greeting).
    if (!this.opened) {
      if (frame.type === WS_EVENT_TYPE.error) this.options.onRejected?.(frame)
      return
    }

    // Any frame proves the connection is alive, `pong` included.
    this.clearPongTimer()
    this.options.onFrame(frame)
  }

  /**
   * Liveness check. A route reply (answer body) is only guaranteed on
   * `$default`; replies from other routes depend on the gateway's mapping and
   * may never reach the client. So a silent ping is *not* treated as a dead
   * socket — the platform `onclose`/`onerror` already report real drops — and
   * the ping only has to keep the connection from going idle.
   */
  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      // One outstanding ping at a time keeps the traffic predictable.
      if (this.pongTimer) return
      if (!this.isOpen) return
      // Goes through `send()` so the traffic logger sees it too.
      this.send({ action: WS_SYSTEM_ACTION })

      this.pongTimer = setTimeout(() => {
        // No answer: assume the gateway does not reply for this route and keep
        // the socket. A genuinely dead socket is reported by the platform.
        this.pongTimer = null
      }, PONG_TIMEOUT_MS)
    }, PING_INTERVAL_MS)
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.clearPongTimer()
  }

  private clearPongTimer(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer)
    this.pongTimer = null
  }

  private clearOpenTimer(): void {
    if (this.openTimer) clearTimeout(this.openTimer)
    this.openTimer = null
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private clearAllTimers(): void {
    this.clearOpenTimer()
    this.stopPing()
    this.clearReconnect()
  }
}

/** Functional constructor for call sites that do not need the class name. */
export const createWsClient = (options: WsClientOptions) => new WsClient(options)
