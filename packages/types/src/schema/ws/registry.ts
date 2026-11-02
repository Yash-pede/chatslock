import z, { type ZodType } from "zod"
import type { WsGroup } from "./envelope"
import { messageWsGroup } from "./message"
import { userWsGroup } from "./user"

/**
 * The single registry of WS routes.
 *
 * To add a group:
 * 1. create `schema/ws/<name>.ts` with a `defineWsGroup({ action, ops })`
 * 2. add it to `WS_GROUPS` below
 * 3. wire its handlers with `app.group("<name>").on(...)`
 *
 * Validation, frame types and the accepted `action` enum all derive from here,
 * so no other file needs to know the group's name or operations.
 */
export const WS_GROUPS = {
  [messageWsGroup.action]: messageWsGroup,
  [userWsGroup.action]: userWsGroup,
} as const

export type WsAction = keyof typeof WS_GROUPS

/** Every registered `action`, as a tuple for `z.enum`. */
export const WS_ACTIONS = Object.keys(WS_GROUPS) as [WsAction, ...WsAction[]]

/** Any client → server frame. `action` must name a registered group. */
export const wsFrameSchema = z.strictObject({
  action: z.enum(WS_ACTIONS),
  op: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
})
export type WsRequestFrame = z.infer<typeof wsFrameSchema>

/** Group registered for `action`, if any. */
export const getWsGroup = (action: string): WsGroup | undefined =>
  WS_GROUPS[action as WsAction] as WsGroup | undefined

/** Request frame schema for `action.op`, if that operation is registered. */
export const getWsOpSchema = (action: string, op: string): ZodType | undefined =>
  getWsGroup(action)?.ops[op]
