/**
 * String constants for the realtime channel, shared by the Lambda and the
 * clients so no layer hardcodes event, ack or op names as literals.
 */
export const WS_MESSAGE_ACTION = "message" as const
export type WsMessageAction = typeof WS_MESSAGE_ACTION

/**
 * Route key for connection liveness only. It is NOT part of the message ops:
 * a heartbeat must never be validated against a message schema or reported as
 * an unroutable frame.
 */
export const WS_PING_ACTION = "ping" as const
export type WsPingAction = typeof WS_PING_ACTION

/**
 * Route key for a catch-all acknowledgement. API Gateway only lets the client
 * observe a round trip through a route that answers *without* invoking the
 * Lambda, so this one uses a fixed MOCK integration (see terraform). The app
 * sends it to prove the socket is alive when a real request is not in flight.
 */
export const WS_SYSTEM_ACTION = "system" as const
export type WsSystemAction = typeof WS_SYSTEM_ACTION

/** Fixed reply of the mock `system` route; the client only needs any frame. */
export const WS_SYSTEM_ACK = { type: "pong" } as const

export const WS_EVENT_TYPE = {
  connected: "connected",
  error: "error",
  /** Reply to the `ping` route: proves the round trip end to end. */
  pong: "pong",
} as const
export type WsEventType = (typeof WS_EVENT_TYPE)[keyof typeof WS_EVENT_TYPE]

export const WS_MESSAGE_EVENT_TYPE = {
  created: "message.new",
  updated: "message.updated",
  deleted: "message.deleted",
} as const
export type WsMessageEventName = keyof typeof WS_MESSAGE_EVENT_TYPE
export type WsMessageEventType = (typeof WS_MESSAGE_EVENT_TYPE)[WsMessageEventName]

export const WS_MESSAGE_ACK_TYPE = {
  sent: "message.sent",
  edited: "message.edited",
  deleted: "message.deleted",
  list: "message.list",
} as const
export type WsMessageAckName = keyof typeof WS_MESSAGE_ACK_TYPE
export type WsMessageAckType = (typeof WS_MESSAGE_ACK_TYPE)[WsMessageAckName]

export const WS_MESSAGE_OP = {
  send: "send",
  edit: "edit",
  delete: "delete",
  list: "list",
  read: "read",
} as const
export type WsMessageOpName = keyof typeof WS_MESSAGE_OP
export type WsMessageOp = (typeof WS_MESSAGE_OP)[WsMessageOpName]
