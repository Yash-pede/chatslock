import z, { type ZodType } from "zod"

/**
 * Client-generated id, sent in `data.clientId` and echoed unchanged on the ack
 * (also `clientId`) so a reply can be matched to the frame that caused it.
 * One name end to end: never `requestId`.
 */
export const clientIdSchema = z.string().min(1).max(64)

/** Largest frame the Lambda accepts, in bytes. */
export const MAX_WS_FRAME_BYTES = 64 * 1024

/**
 * Route key for connection liveness only. It is NOT part of a schema group:
 * a heartbeat must never be validated against a group schema or reported as an
 * unroutable frame.
 */
export const WS_PING_ACTION = "ping" as const
export type WsPingAction = typeof WS_PING_ACTION

/**
 * Route key for a catch-all acknowledgement. API Gateway only lets the client
 * observe a round trip through a route that answers *without* invoking the
 * Lambda, so this one uses a fixed MOCK integration (see terraform).
 */
export const WS_SYSTEM_ACTION = "system" as const
export type WsSystemAction = typeof WS_SYSTEM_ACTION

/** Fixed reply of the mock `system` route; the client only needs any frame. */
export const WS_SYSTEM_ACK = { type: "pong" } as const

/** Frame types every group may emit. */
export const WS_EVENT_TYPE = {
  connected: "connected",
  error: "error",
  pong: "pong",
} as const
export type WsEventType = (typeof WS_EVENT_TYPE)[keyof typeof WS_EVENT_TYPE]

/** Error frame, shared by every group. */
export const wsErrorAckSchema = z.strictObject({
  type: z.literal(WS_EVENT_TYPE.error),
  code: z.string().optional(),
  message: z.string(),
  clientId: clientIdSchema.optional(),
})
export type WsErrorAck = z.infer<typeof wsErrorAckSchema>

/**
 * One WS route key and the request schema for each operation it accepts.
 * A frame is `{ action, op, data }`; `action` picks the group and `op` picks
 * the schema inside `ops`. Build each entry with `wsFrame`.
 */
export interface WsGroup {
  action: string
  ops: Record<string, ZodType>
}

/** Identity helper that keeps action/op names inferred as string literals. */
export const defineWsGroup = <const G extends WsGroup>(group: G): G => group

/**
 * Builds the schema for one operation: a strict `{ action, op, data }` frame.
 * Keeping the envelope here means a new group only writes its `data` schemas.
 */
export const wsFrame = <
  const A extends string,
  const Op extends string,
  T extends ZodType,
>(
  action: A,
  op: Op,
  data: T,
) =>
  z.strictObject({
    action: z.literal(action),
    op: z.literal(op),
    data,
  })
