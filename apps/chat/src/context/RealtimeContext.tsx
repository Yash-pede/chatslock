import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { AppState } from "react-native"
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo"
import { Amplify } from "aws-amplify"
import { events, type EventsChannel } from "aws-amplify/api"
import { tokenManager, tokenRefreshService } from "@repo/utils"
import { useProfile } from "@/context/profile/ProfileContext"

const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000
const CONNECT_TIMEOUT_MS = 15_000
const READY_TIMEOUT_MS = 15_000

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
  | { status: "connecting"; promise: Promise<void>; epoch: number }
  | {
      status: "open"
      connection: EventsChannel
      subscription: EventsSubscription
      /** ID token the socket was authorized with; a refresh forces a reopen. */
      idToken: string
    }
  | { status: "reconnecting"; timer: ReturnType<typeof setTimeout>; attempt: number }

const listeners = new Map<string, Set<Listener>>()
const channels = new Map<string, ChannelState>()
/** Consecutive failed attempts per channel, used for exponential backoff. */
const retryCounts = new Map<string, number>()
/**
 * Invalidates in-flight connects when a channel is closed or a newer attempt
 * starts, so a late socket cannot resurrect a channel that was already dropped.
 */
const connectEpochs = new Map<string, number>()
const reconnectListeners = new Set<() => void>()

/**
 * Last definitive NetInfo answer. While offline no reconnect timers are kept:
 * the online transition rebuilds every active channel, which avoids a retry
 * loop that cannot succeed.
 */
let networkOnline = true

const isOnline = (state: NetInfoState) =>
  state.isConnected === true && state.isInternetReachable === true
const isOffline = (state: NetInfoState) =>
  state.isConnected === false || state.isInternetReachable === false

const notifyReconnected = () => {
  reconnectListeners.forEach((listener) => listener())
}

/**
 * A valid Cognito **ID token** (AppSync Events rejects the access token in the
 * authorization header). Awaits the shared silent refresh instead of returning
 * null, so a publish right after expiry still goes out on the first try.
 */
const currentIdToken = async (): Promise<string> => {
  if (!tokenRefreshService.ensureAccessToken() || tokenManager.isIdTokenExpired()) {
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
  // Any connect still in flight belongs to an older epoch and must not open.
  connectEpochs.set(channel, (connectEpochs.get(channel) ?? 0) + 1)

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
    retryCounts.delete(channel)
    connectEpochs.delete(channel)
    channels.delete(channel)
    return
  }

  // Offline: wait for NetInfo's online transition instead of retrying blindly.
  if (!networkOnline) {
    channels.delete(channel)
    return
  }

  if (channels.get(channel)?.status === "reconnecting") return

  const attempt = (retryCounts.get(channel) ?? 0) + 1
  retryCounts.set(channel, attempt)
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS)
  const timer = setTimeout(
    () => {
      channels.delete(channel)
      void ensureChannel(channel)
    },
    delay + Math.random() * 500,
  )

  channels.set(channel, { status: "reconnecting", timer, attempt })
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** Opens (or joins) the single socket for a channel. */
const ensureChannel = (channel: string): Promise<void> => {
  if (!networkOnline) return Promise.resolve()

  const state = channels.get(channel)
  if (state?.status === "open") return Promise.resolve()
  if (state?.status === "connecting") return state.promise
  if (state?.status === "reconnecting") clearTimeout(state.timer)

  const epoch = (connectEpochs.get(channel) ?? 0) + 1
  connectEpochs.set(channel, epoch)

  let connection: EventsChannel | undefined
  let subscription: EventsSubscription | undefined

  const promise = (async () => {
    try {
      const idToken = await currentIdToken()
      if (connectEpochs.get(channel) !== epoch) return
      if (!networkOnline || !listeners.get(channel)?.size) {
        channels.delete(channel)
        return
      }

      const connectPromise = events.connect(channel, {
        authMode: "lambda",
        authToken: idToken,
      })

      try {
        connection = await withTimeout(
          connectPromise,
          CONNECT_TIMEOUT_MS,
          "Realtime connection timed out",
        )
      } catch (error) {
        // If the timeout won, a late connection must not be leaked.
        void connectPromise.then((late) => late.close()).catch(() => undefined)
        throw error
      }

      // A newer attempt or unsubscribe happened while the socket was opening.
      if (connectEpochs.get(channel) !== epoch) {
        connection.close()
        return
      }
      if (!networkOnline || !listeners.get(channel)?.size) {
        connection.close()
        channels.delete(channel)
        return
      }

      subscription = connection.subscribe({
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

      await withTimeout(subscription.ready, READY_TIMEOUT_MS, "Realtime subscription timed out")

      // A newer attempt or an unsubscribe may have replaced this connection.
      if (connectEpochs.get(channel) !== epoch) {
        subscription.unsubscribe()
        connection.close()
        return
      }
      if (channels.get(channel)?.status !== "open") return

      retryCounts.delete(channel)
      console.log("[realtime] channel ready", { channel })
      notifyReconnected()
    } catch (error) {
      if (connectEpochs.get(channel) !== epoch) {
        // Superseded mid-connect: only clean up this attempt's own socket.
        subscription?.unsubscribe()
        connection?.close()
        return
      }

      console.warn("[realtime] channel connect failed", { channel, error })
      closeChannel(channel)
      scheduleReconnect(channel)
    } finally {
      const current = channels.get(channel)
      if (current?.status === "connecting" && current.epoch === epoch) {
        channels.delete(channel)
      }
    }
  })()

  channels.set(channel, { status: "connecting", promise, epoch })
  return promise
}

interface RealtimeContextValue {
  /** Publishes a payload over the channel's WebSocket. */
  publish: (channel: string, payload: unknown) => Promise<void>
  /** Receives every event on the channel; returns an unsubscribe. */
  subscribe: (channel: string, listener: Listener) => () => void
  /** False while NetInfo reports no usable connection. */
  online: boolean
  /** Increments whenever a channel becomes ready (including reconnects). */
  reconnectVersion: number
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
  const [online, setOnline] = useState(true)
  const [reconnectVersion, setReconnectVersion] = useState(0)

  useEffect(() => {
    const listener = () => setReconnectVersion((value) => value + 1)
    reconnectListeners.add(listener)
    return () => {
      reconnectListeners.delete(listener)
    }
  }, [])

  // Connectivity is the source of truth for whether retrying makes sense.
  // Losing the network closes the sockets immediately instead of waiting for
  // Amplify to notice a half-open WebSocket. The listener also runs while
  // signed out so the first signed-in screen sees the correct state.
  useEffect(() => {
    const apply = (state: NetInfoState) => {
      if (isOffline(state)) {
        if (!networkOnline) return
        networkOnline = false
        setOnline(false)
        for (const channel of [...channels.keys()]) closeChannel(channel)
        return
      }

      // `isInternetReachable` is often null while NetInfo re-checks; keep the
      // current state instead of flapping offline/online.
      if (!isOnline(state) || networkOnline) return

      networkOnline = true
      setOnline(true)
      if (!active) return

      for (const channel of listeners.keys()) {
        // A fresh network gets an immediate attempt; backoff restarts if it
        // still cannot connect.
        retryCounts.delete(channel)
        closeChannel(channel)
        void ensureChannel(channel)
      }
    }

    const unsubscribe = NetInfo.addEventListener(apply)
    void NetInfo.fetch()
      .then(apply)
      .catch(() => undefined)
    return unsubscribe
  }, [active])

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
        retryCounts.delete(channel)
        closeChannel(channel)
        connectEpochs.delete(channel)
      }
    }
  }, [])

  const publish = useCallback(async (channel: string, payload: unknown) => {
    console.log("[realtime] publish", { channel, payload })

    if (!networkOnline) throw new Error("You're offline. Try again when connected.")

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

  const value = useMemo<RealtimeContextValue>(
    () => ({ publish, subscribe, online, reconnectVersion }),
    [online, publish, reconnectVersion, subscribe],
  )

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
