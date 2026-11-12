/**
 * AppSync Events channel paths. Amplify's WebSocket subscribe frame expects the
 * full channel path including the leading `/` (the same form the AppSync console
 * and the Lambda's `event.info.channel.path` use). `events.post` normalizes it
 * too, so everything is built with the slash here.
 *
 * Channel segments cannot contain `#`, so the composite conversation id is
 * spread over path segments: `DIRECT#u1#u2` -> `/conversation/DIRECT/u1/u2`.
 * The Lambda joins them back before validating and using the id.
 *
 * Add a namespace here and use its builder from the API/hook that owns that
 * domain — the realtime provider itself stays namespace-agnostic.
 */
export const REALTIME_NAMESPACES = {
  conversation: "conversation",
  user: "user",
} as const

export type RealtimeNamespace = keyof typeof REALTIME_NAMESPACES

/** `/<namespace>/<id>` — the channel string passed to the realtime context. */
export const realtimeChannel = (namespace: RealtimeNamespace, id: string): string =>
  `/${namespace}/${id}`

/** Conversation events and message publishes (`#` is not allowed in channels). */
export const conversationChannel = (conversationId: string): string =>
  realtimeChannel("conversation", conversationId.replaceAll("#", "/"))

/** Per-user events, e.g. peer presence. */
export const userChannel = (userId: string): string => realtimeChannel("user", userId)
