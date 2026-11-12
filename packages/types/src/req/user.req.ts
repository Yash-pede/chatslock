import z from "zod"
import { compositeConversationId } from "../schema/conversation.schema"
import { baseSchema } from "./base"

/** Presence the client reports when it opens or leaves a conversation. */
export const CLIENT_CONVERSATION_STATUS = ["OPENED", "CLOSED"] as const
export type ClientConversationStatus = (typeof CLIENT_CONVERSATION_STATUS)[number]

export const PEER_USER_STATUS = ["ONLINE", "OFFLINE"] as const
export type PeerUserStatus = (typeof PEER_USER_STATUS)[number]

/** Client → server presence event on `/user/<userId>`; the handler broadcasts it. */
export const USER_EVENT = {
  status: "user.status",
} as const
export type UserEvent = (typeof USER_EVENT)[keyof typeof USER_EVENT]

export const userStatusData = z.strictObject({
  userStatus: z.enum(PEER_USER_STATUS),
})

export const userPublishEnvelopeSchema = z.discriminatedUnion("eventType", [
  z.strictObject({ eventType: z.literal(USER_EVENT.status), data: userStatusData }),
])
export type UserPublishPayload = z.infer<typeof userPublishEnvelopeSchema>

export const userActiveConversationReq = baseSchema.extend({
  body: z.strictObject({
    conversationId: compositeConversationId,
    status: z.enum(CLIENT_CONVERSATION_STATUS),
  }),
})
export type UserActiveConversationReq = z.infer<typeof userActiveConversationReq>
