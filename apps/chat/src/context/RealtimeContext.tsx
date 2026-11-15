import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react"
import { AppState } from "react-native"
import { Amplify } from "aws-amplify"
import { events, type EventsChannel } from "aws-amplify/api"
import { tokenManager, tokenRefreshService } from "@repo/utils"
import { useProfile } from "@/context/profile/ProfileContext"

const RECONNECT_DELAY_MS = 3_000

/**
 * Amplify needs the Events endpoint once. Auth is always supplied per call from
 * our own Cognito session (`authMode: "lambda"` makes Amplify use the
 * `authToken` header instead of its own Auth session), because this app does not
 * use Amplify Auth.
 */
Amplify.configure({
  API: {
    Events: {
      endpoint: process.env.EXPO_PUBLIC_WSAPI_URL!,
      region: process.env.EXPO_PUBLIC_REGION,
      defaultAuthMode: "lambda",
    },
  },
})

/** Payload published by the Lambda; `eventType` is the server event name. */
export type RealtimeEvent = { eventType?: string; [key: string]: unknown }

type Listener = (event: RealtimeEvent) => void
type EventsSubscription = ReturnType<EventsChannel["subscribe"]>

/**
 * Explicit lifecycle for one channel. There is no "is it open?" boolean hidden
 * in refs: every channel is in exactly one of these states.
 */
type ChannelState =
  | { status: "connecting"; promise: Promise<void> }
  | {
      status: "open"
      connection: EventsChannel
      subscription: EventsSubscription
      /** ID token the socket was authorized with; a refresh forces a reopen. */
      idToken: string
    }
  | { status: "reconnecting"; timer: ReturnType<typeof setTimeout> }

const listeners = new Map<string, Set<Listener>>()
const channels = new Map<string, ChannelState>()

/**
 * A valid Cognito **ID token** (AppSync Events rejects the access token in the
 * authorization header). Awaits the shared silent refresh instead of returning
 * null, so a publish right after expiry still goes out on the first try.
 */
const currentIdToken = async (): Promise<string> => {
  if (!tokenRefreshService.ensureAccessToken()) {
    await tokenRefreshService.refreshNow()
  }

  const idToken = tokenManager.getIdToken()
  if (!idToken) throw new Error("Not authenticated")
  return idToken
}

const dispatch = (channel: string, event: RealtimeEvent) => {
  console.log("[realtime] event received", { channel, event })
  listeners.get(channel)?.forEach((listener) => listener(event))
}

const closeChannel = (channel: string) => {
  const state = channels.get(channel)
  if (!state) return

  channels.delete(channel)

  if (state.status === "reconnecting") {
    clearTimeout(state.timer)
    return
  }

  if (state.status === "open") {
    state.subscription.unsubscribe()
    state.connection.close()
  }
}

const scheduleReconnect = (channel: string) => {
  if (!listeners.get(channel)?.size) {
    channels.delete(channel)
    return
  }

  if (channels.get(channel)?.status === "reconnecting") return

  const timer = setTimeout(() => {
    channels.delete(channel)
    void ensureChannel(channel)
  }, RECONNECT_DELAY_MS)

  channels.set(channel, { status: "reconnecting", timer })
}

/** Opens (or joins) the single socket for a channel. */
const ensureChannel = (channel: string): Promise<void> => {
  const state = channels.get(channel)
  if (state?.status === "open") return Promise.resolve()
  if (state?.status === "connecting") return state.promise
  if (state?.status === "reconnecting") clearTimeout(state.timer)

  const promise = (async () => {
    try {
      const idToken = await currentIdToken()
      if (!listeners.get(channel)?.size) {
        channels.delete(channel)
        return
      }

      const connection = await events.connect(channel, {
        authMode: "lambda",
        authToken: idToken,
      })

      if (!listeners.get(channel)?.size) {
        connection.close()
        channels.delete(channel)
        return
      }

      const subscription = connection.subscribe({
        next: (frame: { event?: unknown }) => {
          if (frame?.event && typeof frame.event === "object") {
            dispatch(channel, frame.event as RealtimeEvent)
          }
        },
        error: () => {
          console.warn("[realtime] channel error", { channel })
          closeChannel(channel)
          scheduleReconnect(channel)
        },
      })

      channels.set(channel, { status: "open", connection, subscription, idToken })

      void subscription.ready
        .then(() => console.log("[realtime] channel ready", { channel }))
        .catch((error) => {
          console.warn("[realtime] channel ready failed", { channel, error })
          closeChannel(channel)
          scheduleReconnect(channel)
        })
    } catch (error) {
      console.warn("[realtime] channel connect failed", { channel, error })
      scheduleReconnect(channel)
    } finally {
      if (channels.get(channel)?.status === "connecting") channels.delete(channel)
    }
  })()

  channels.set(channel, { status: "connecting", promise })
  return promise
}

interface RealtimeContextValue {
  /** Publishes a payload over the channel's WebSocket. */
  publish: (channel: string, payload: unknown) => Promise<void>
  /** Receives every event on the channel; returns an unsubscribe. */
  subscribe: (channel: string, listener: Listener) => () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

export function RealtimeProvider({
  active = true,
  children,
}: {
  /** False closes every channel (no session). The provider stays mounted. */
  active?: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!active) {
      for (const channel of [...channels.keys()]) closeChannel(channel)
      return
    }

    for (const channel of listeners.keys()) void ensureChannel(channel)
  }, [active])

  // Backgrounding suspends the socket: rebuild channels on return. The token
  // itself is refreshed by silent auth/`currentIdToken`, so no explicit
  // `/auth/refresh` call is made here.
  useEffect(() => {
    if (!active) return

    const onAppStateChange = (next: string) => {
      if (next !== "active") return
      for (const channel of listeners.keys()) {
        closeChannel(channel)
        void ensureChannel(channel)
      }
    }

    const subscription = AppState.addEventListener("change", onAppStateChange)
    return () => subscription.remove()
  }, [active])

  const subscribe = useCallback((channel: string, listener: Listener) => {
    const channelListeners = listeners.get(channel) ?? new Set<Listener>()
    channelListeners.add(listener)
    listeners.set(channel, channelListeners)
    console.log("[realtime] subscribe", { channel, listeners: channelListeners.size })

    void ensureChannel(channel)

    return () => {
      const current = listeners.get(channel)
      if (!current) return

      current.delete(listener)
      console.log("[realtime] unsubscribe", { channel, listeners: current.size })
      if (current.size === 0) {
        listeners.delete(channel)
        closeChannel(channel)
      }
    }
  }, [])

  const publish = useCallback(async (channel: string, payload: unknown) => {
    console.log("[realtime] publish", { channel, payload })

    // A publish is authorized with the token captured when the socket opened.
    // If the session rotated since, the socket must be rebuilt first.
    const idToken = await currentIdToken()
    const state = channels.get(channel)
    if (state?.status === "open" && state.idToken !== idToken) {
      closeChannel(channel)
      void ensureChannel(channel)
    } else if (state?.status === "connecting") {
      await state.promise
    }

    const current = channels.get(channel)
    if (current?.status === "open") {
      try {
        // Amplify's payload type is a recursive JSON union; callers pass the
        // schema output, which only needs to be JSON-serializable.
        await current.connection.publish(payload as never)
        console.log("[realtime] publish sent", { channel })
        return
      } catch (error) {
        console.warn("[realtime] publish on open channel failed, reconnecting", {
          channel,
          error,
        })
        closeChannel(channel)
        void ensureChannel(channel)
      }
    }

    // No usable socket (never subscribed, or the open one just failed): publish
    // over a short-lived channel authorized with the fresh token.
    const connection = await events.connect(channel, {
      authMode: "lambda",
      authToken: idToken,
    })

    try {
      await connection.publish(payload as never)
      console.log("[realtime] publish sent", { channel, shortLived: true })
    } finally {
      connection.close()
    }
  }, [])

  const value = useMemo<RealtimeContextValue>(() => ({ publish, subscribe }), [publish, subscribe])

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

/** Realtime transport. Must be used inside `<RealtimeProvider>`. */
export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext)
  if (!context) {
    throw new Error("useRealtime must be used inside <RealtimeProvider>")
  }
  return context
}

/** Runs the channels while a session exists. */
export function RealtimeGate({ children }: { children: React.ReactNode }) {
  const { signedIn } = useProfile()
  return <RealtimeProvider active={signedIn}>{children}</RealtimeProvider>
}
