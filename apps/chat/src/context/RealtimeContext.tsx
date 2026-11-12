import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react"
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

/** Payload published by the Lambda; `type` is the server event name. */
export type RealtimeEvent = { eventType?: string; [key: string]: unknown }

type Listener = (event: RealtimeEvent) => void

interface ChannelEntry {
  channel: EventsChannel
  subscription: ReturnType<EventsChannel["subscribe"]>
}

/**
 * Channels and their listeners live at module scope so a provider re-render can
 * never detach a screen's subscription. Channels are keyed by their full path
 * (`conversation/DIRECT#u1#u2`, `user/<uuid>`), so any namespace works the same.
 */
const listeners = new Map<string, Set<Listener>>()
const entries = new Map<string, ChannelEntry>()
const opening = new Map<string, Promise<void>>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()

const dispatch = (channel: string, event: RealtimeEvent) => {
  console.log("[realtime] event received", { channel, event })
  listeners.get(channel)?.forEach((listener) => listener(event))
}

const closeChannel = (channel: string) => {
  const timer = retryTimers.get(channel)
  if (timer) {
    clearTimeout(timer)
    retryTimers.delete(channel)
  }

  const entry = entries.get(channel)
  if (!entry) return

  entries.delete(channel)
  entry.subscription.unsubscribe()
  entry.channel.close()
}

const scheduleReconnect = (channel: string) => {
  if (retryTimers.has(channel) || !listeners.get(channel)?.size) return

  retryTimers.set(
    channel,
    setTimeout(() => {
      retryTimers.delete(channel)
      void openChannel(channel)
    }, RECONNECT_DELAY_MS),
  )
}

/** Opens one WebSocket channel (Amplify reuses the socket across channels). */
const openChannel = (channel: string): Promise<void> => {
  if (entries.has(channel)) return Promise.resolve()
  const pending = opening.get(channel)
  if (pending) return pending

  const promise = (async () => {
    try {
      // `ensureAccessToken` also refreshes the session (which rotates the ID
      // token). AppSync Events requires the Cognito **ID token** in the
      // Authorization header, not the access token.
      const accessToken = tokenRefreshService.ensureAccessToken()
      const idToken = tokenManager.getIdToken()
      if (!accessToken || !idToken) {
        // A silent refresh is in flight; retry opens once the session exists.
        scheduleReconnect(channel)
        return
      }

      if (!listeners.get(channel)?.size) return

      const connection = await events.connect(channel, {
        authMode: "lambda",
        authToken: idToken,
      })

      if (!listeners.get(channel)?.size) {
        connection.close()
        return
      }

      const subscription = connection.subscribe({
        next: (frame: { event?: unknown }) => {
          if (frame?.event && typeof frame.event === "object") {
            dispatch(channel, frame.event as RealtimeEvent)
          }
        },
        error: () => {
          closeChannel(channel)
          scheduleReconnect(channel)
        },
      })

      entries.set(channel, { channel: connection, subscription })

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
      opening.delete(channel)
    }
  })()

  opening.set(channel, promise)
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
      for (const channel of [...entries.keys()]) closeChannel(channel)
      return
    }

    for (const channel of listeners.keys()) void openChannel(channel)
  }, [active])

  const subscribe = useCallback((channel: string, listener: Listener) => {
    const channelListeners = listeners.get(channel) ?? new Set<Listener>()
    channelListeners.add(listener)
    listeners.set(channel, channelListeners)
    console.log("[realtime] subscribe", { channel, listeners: channelListeners.size })

    void openChannel(channel)

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

    // Wait for a channel that is already connecting for a subscriber, so the
    // publish goes out on the same socket instead of opening a second one.
    await opening.get(channel)

    const entry = entries.get(channel)
    if (entry) {
      // Amplify's payload type is a recursive JSON union; callers pass the
      // schema output, which only needs to be JSON-serializable.
      await entry.channel.publish(payload as never)
      console.log("[realtime] publish sent", { channel })
      return
    }

    // Nothing is subscribed: use a short-lived channel just for this publish.
    const idToken = tokenRefreshService.ensureAccessToken() && tokenManager.getIdToken()
    if (!idToken) throw new Error("Not authenticated")

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
