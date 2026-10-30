import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AppState } from "react-native"
import { tokenRefreshService } from "@repo/utils"
import { useToast } from "@repo/ui"
import { wsConnectUrl } from "@/lib/ws"
import { wsTraffic } from "@/lib/ws-debug"
import { WsClient, type SocketLike, type WsFrame, type WsStatus } from "@/lib/ws-client"
import { useProfile } from "@/context/profile/ProfileContext"

export type { WsStatus }

export interface WsSendInput {
  action: string
  op: string
  data?: unknown
}

interface WsContextValue {
  status: WsStatus
  /** The socket is open and will accept a frame right now. */
  isOpen: () => boolean
  /** Sends `{action, op, data}`; false when the socket is not open. */
  send: (input: WsSendInput) => boolean
  /** Subscribes to frames of a given `type`; returns an unsubscribe. */
  on: (type: string, handler: (payload: WsFrame) => void) => () => void
  /**
   * Sends `{action, op}` and resolves/rejects from the first matching frame.
   * `waitForOpenMs` lets the call wait for the socket to (re)open before sending
   * instead of failing immediately; pass `0` to fail fast (e.g. when the caller
   * has a REST fallback). Defaults to `timeoutMs`.
   */
  request: <T>(
    input: WsSendInput,
    options: { types: string[]; timeoutMs: number; waitForOpenMs?: number },
  ) => Promise<T>
}

const WsContext = createContext<WsContextValue | null>(null)

const TOAST_THROTTLE_MS = 8_000

/**
 * On foreground we only rebuild the socket after a real background stay. Brief
 * flaps (native image picker, permission dialog, control centre) keep the live
 * socket, so a healthy connection is never torn down mid-action.
 */
const BACKGROUND_RECONNECT_MS = 30_000
/** How often to poll for the socket to reopen while waiting to send. */
const OPEN_POLL_MS = 100

/** `[ws] status …` / `[ws] closed …` always; the rest only in development. */
const log = {
  always(event: string, detail?: Record<string, unknown>) {
    console.log(`[ws] ${event}`, detail ?? "")
  },
  dev(event: string, detail?: Record<string, unknown>) {
    if (__DEV__) console.log(`[ws] ${event}`, detail ?? "")
  },
  warn(event: string, detail?: Record<string, unknown>) {
    console.warn(`[ws] ${event}`, detail ?? "")
  },
}

/**
 * Frames are dispatched from the socket, but subscribers belong to screens:
 * the table lives at module scope so a provider re-render (or a route change)
 * can never silently detach them.
 */
const frameListeners = new Map<string, Set<(frame: WsFrame) => void>>()

const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export function WsProvider({
  active = true,
  children,
}: {
  /** False stops the socket (no session). The provider element stays mounted. */
  active?: boolean
  children: React.ReactNode
}) {
  const { toast } = useToast()
  const [status, setStatus] = useState<WsStatus>("connecting")
  const clientRef = useRef<WsClient | null>(null)
  const lastToastRef = useRef(0)
  /** When the app left the foreground, to measure how long it stayed away. */
  const backgroundedAtRef = useRef<number | null>(null)

  const dispatch = useCallback((frame: WsFrame) => {
    if (!frame.type) return
    frameListeners.get(frame.type)?.forEach((handler) => handler(frame))
  }, [])

  const toastOffline = useCallback(
    (description: string) => {
      const now = Date.now()
      if (now - lastToastRef.current < TOAST_THROTTLE_MS) return
      lastToastRef.current = now
      toast({ title: "No network connection", description, variant: "destructive" })
    },
    [toast],
  )

  useEffect(() => {
    if (!active) return

    const client = new WsClient({
      open: () => {
        // `ensureAccessToken` returns the valid token or starts a refresh; the
        // socket is retried by `WsClient`'s own backoff until one exists.
        const token = tokenRefreshService.ensureAccessToken()
        if (!token) {
          log.dev("no access token yet")
          return null
        }
        return new WebSocket(wsConnectUrl(token)) as unknown as SocketLike
      },
      onStatusChange: (next) => {
        log.always("status", { status: next })
        wsTraffic.event("status", { status: next })
        setStatus(next)
      },
      onFrame: (frame) => {
        log.dev("frame", { type: frame.type })
        dispatch(frame)
      },
      onRejected: (frame) => {
        log.warn("handshake refused", { message: frame.message })
        void tokenRefreshService.refreshNow()
      },
      onDropped: () => toastOffline("You are offline. Messages will reconnect automatically."),
      onClosed: ({ code, reason, wasOpen, retryInMs }) => {
        if (wasOpen) log.always("closed", { code, reason: reason || undefined, retryInMs })
        else log.warn("closed before opening", { code, reason: reason || undefined, retryInMs })
      },
    })

    clientRef.current = client
    client.connect()

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        const awayMs = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0
        backgroundedAtRef.current = null
        // Rebuild only after a real background stay (pings were suspended, so
        // the socket is likely dead) or when the socket is already closed. A
        // short flap keeps the live socket and avoids needless churn.
        if (awayMs >= BACKGROUND_RECONNECT_MS || !client.isOpen) client.reconnectNow()
      } else {
        backgroundedAtRef.current = Date.now()
      }
    })

    return () => {
      subscription.remove()
      client.dispose()
      if (clientRef.current === client) clientRef.current = null
    }
  }, [active, dispatch, toastOffline])

  const send = useCallback(({ action, op, data }: WsSendInput) => {
    const sent = clientRef.current?.send({ action, op, data }) ?? false
    if (!sent) log.dev("send skipped, socket not open", { op })
    return sent
  }, [])

  /**
   * True when the socket is open. Callers use it to skip a request instead of
   * waiting out `timeoutMs` on a socket that cannot answer (a closed socket
   * rejects immediately, but a `reconnecting` one would just time out).
   */
  const isOpen = useCallback(() => clientRef.current?.isOpen ?? false, [])

  /**
   * Resolves once the socket is open, polling until `timeoutMs`. Pass `0` to
   * fail immediately when it is not open yet (callers with a REST fallback).
   */
  const waitForOpen = useCallback((timeoutMs: number): Promise<void> => {
    if (clientRef.current?.isOpen) return Promise.resolve()
    if (timeoutMs <= 0) return Promise.reject(new Error("socket not open"))

    return new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const tick = () => {
        if (clientRef.current?.isOpen) return resolve()
        if (Date.now() >= deadline) return reject(new Error("socket not open"))
        setTimeout(tick, OPEN_POLL_MS)
      }
      tick()
    })
  }, [])

  const on = useCallback((type: string, handler: (payload: WsFrame) => void) => {
    const handlers = frameListeners.get(type) ?? new Set()
    handlers.add(handler)
    frameListeners.set(type, handlers)
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) frameListeners.delete(type)
    }
  }, [])

  /**
   * Sends one frame and waits for the reply that belongs to it.
   *
   * Every request is tagged with a unique `clientId` (sent inside the frame). The
   * server echoes that id back on its reply, so we can tell our reply apart from
   * replies to other in-flight requests. The first frame with a matching
   * `clientId` and one of the expected `types` settles this promise:
   * `"error"` rejects, anything else resolves with the frame.
   */
  const request = useCallback(
    <T,>(
      input: WsSendInput,
      { types, timeoutMs, waitForOpenMs = timeoutMs }: { types: string[]; timeoutMs: number; waitForOpenMs?: number },
    ) =>
      new Promise<T>((resolve, reject) => {
        const clientId =
          (input.data as { clientId?: string } | undefined)?.clientId ?? newRequestId()

        const offs: (() => void)[] = []
        let timer: ReturnType<typeof setTimeout>

        // Only settle once, whether we succeed, fail or time out.
        let done = false
        const finish = (settle: () => void) => {
          if (done) return
          done = true
          clearTimeout(timer)
          offs.forEach((off) => off())
          settle()
        }

        // Listen for the reply on each expected frame type.
        for (const type of types) {
          offs.push(
            on(type, (frame) => {
              if (frame.clientId !== clientId) return
              finish(() => {
                if (frame.type === "error") reject(new Error(String(frame.message ?? "Failed")))
                else resolve(frame as T)
              })
            }),
          )
        }

        // One deadline covers both waiting for the socket to reopen and the reply.
        timer = setTimeout(
          () => finish(() => reject(new Error(`${input.op} timed out`))),
          timeoutMs,
        )

        // Wait for the socket to (re)open, then send the frame with its `clientId`.
        waitForOpen(waitForOpenMs)
          .then(() => {
            if (done) return
            if (!send({ ...input, data: { ...(input.data as object), clientId } })) {
              finish(() => reject(new Error("socket not open")))
            }
          })
          .catch((error: unknown) => finish(() => reject(error)))
      }),
    [on, send, waitForOpen],
  )

  const value = useMemo<WsContextValue>(
    () => ({ status, isOpen, send, on, request }),
    [status, isOpen, send, on, request],
  )

  return <WsContext.Provider value={value}>{children}</WsContext.Provider>
}

/** Realtime connection state and actions. Must be used inside `<WsProvider>`. */
export function useWs(): WsContextValue {
  const context = useContext(WsContext)
  if (!context) {
    throw new Error("useWs must be used inside <WsProvider>")
  }
  return context
}

/**
 * Runs the socket while a session exists. The provider is always rendered
 * (only `active` flips), so a `flow` change cannot remount the app tree or
 * dispose the socket.
 */
export function WsGate({ children }: { children: React.ReactNode }) {
  const { signedIn } = useProfile()
  return <WsProvider active={signedIn}>{children}</WsProvider>
}
