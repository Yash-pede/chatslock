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
import { tokenManager } from "@repo/utils"
import { useToast } from "@repo/ui"
import { wsConnectUrl } from "@/lib/ws"
import { useProfile } from "@/context/profile/ProfileContext"

/**
 * Realtime connection for signed-in screens. The access token travels in the
 * query string (the `$connect` authorizer reads `?token=`); drops reconnect
 * with backoff, and persistent failures surface as one "no network" toast.
 */
export type WsStatus = "connecting" | "connected" | "reconnecting"

export interface WsSendInput {
  action: string
  op: string
  data?: unknown
}

interface WsContextValue {
  status: WsStatus
  /** Sends `{action, op, data}`; false when the socket is not open. */
  send: (input: WsSendInput) => boolean
  /** Subscribes to server events of a given `type`; returns an unsubscribe. */
  on: (type: string, handler: (payload: unknown) => void) => () => void
}

const WsContext = createContext<WsContextValue | null>(null)

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const TOAST_THROTTLE_MS = 8_000

export function WsProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast()
  const [status, setStatus] = useState<WsStatus>("connecting")
  const statusRef = useRef<WsStatus>("connecting")
  const socketRef = useRef<WebSocket | null>(null)
  const listenersRef = useRef(new Map<string, Set<(payload: unknown) => void>>())
  const attemptsRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aliveRef = useRef(true)
  const notifiedRef = useRef(false)
  const lastToastRef = useRef(0)
  const connectRef = useRef<() => void>(() => {})

  const setWsStatus = useCallback((next: WsStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const dispatch = useCallback((type: string, payload: unknown) => {
    listenersRef.current.get(type)?.forEach((handler) => handler(payload))
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
    aliveRef.current = true

    const connect = () => {
      const token = tokenManager.getAccessToken()
      if (!aliveRef.current || !token || socketRef.current) return

      setWsStatus(attemptsRef.current === 0 ? "connecting" : "reconnecting")

      const socket = new WebSocket(wsConnectUrl(token))
      socketRef.current = socket

      socket.onopen = () => {
        attemptsRef.current = 0
        notifiedRef.current = false
        setWsStatus("connected")
      }

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as { type?: string }
          if (parsed && typeof parsed.type === "string") dispatch(parsed.type, parsed)
        } catch {
          // ignore non-JSON frames
        }
      }

      socket.onclose = () => {
        socketRef.current = null
        if (!aliveRef.current) return

        attemptsRef.current += 1
        const dropped = statusRef.current === "connected"
        setWsStatus("reconnecting")

        // quiet during cold start; a dropped live connection or a stubborn
        // outage notifies once, not on every retry
        if (!notifiedRef.current && (dropped || attemptsRef.current >= 3)) {
          notifiedRef.current = true
          toastOffline("You are offline. Messages will reconnect automatically.")
        }

        const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attemptsRef.current - 1), RECONNECT_MAX_MS)
        timerRef.current = setTimeout(() => connectRef.current(), delay)
      }

      socket.onerror = () => socket.close()
    }

    connectRef.current = connect
    connect()

    // returning to the foreground retries immediately, skipping the backoff
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || socketRef.current?.readyState === WebSocket.OPEN) return
      if (timerRef.current) clearTimeout(timerRef.current)
      attemptsRef.current = 0
      connectRef.current()
    })

    return () => {
      aliveRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      subscription.remove()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [dispatch, setWsStatus, toastOffline])

  const send = useCallback(
    ({ action, op, data }: WsSendInput) => {
      const socket = socketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        toastOffline("Your message could not be sent. Retrying when back online.")
        return false
      }
      socket.send(JSON.stringify({ action, op, data }))
      return true
    },
    [toastOffline],
  )

  const on = useCallback((type: string, handler: (payload: unknown) => void) => {
    const listeners = listenersRef.current.get(type) ?? new Set()
    listeners.add(handler)
    listenersRef.current.set(type, listeners)
    return () => {
      listeners.delete(handler)
      if (listeners.size === 0) listenersRef.current.delete(type)
    }
  }, [])

  const value = useMemo<WsContextValue>(() => ({ status, send, on }), [status, send, on])

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
 * Mounts the socket only while the user is signed in. Lives at the root so
 * the connection survives navigation between route groups; sign-out unmounts
 * it (and closes the socket) with the provider.
 */
export function WsGate({ children }: { children: React.ReactNode }) {
  const { flow } = useProfile()
  if (flow !== "ready") return <>{children}</>
  return <WsProvider>{children}</WsProvider>
}
