import z from "zod"
import { defineWsGroup, wsFrame } from "./envelope"
import { compositeConversationId } from "../conversation.schema"

export const WS_USER_ACTION = "user" as const
export const WS_USER_OP = { conversation: "conversation" } as const

export const WS_USER_EVENT_TYPE = {
  connection: "user.connection",
} as const
export type WsUserEventType = (typeof WS_USER_EVENT_TYPE)[keyof typeof WS_USER_EVENT_TYPE]

export const WS_USER_ACK_TYPE = {
  peerStatus: "user.peerStatus",
} as const
export type WsUserAckType = (typeof WS_USER_ACK_TYPE)[keyof typeof WS_USER_ACK_TYPE]

// ---- client → server: one `data` schema per op ----
export const ClientConversationStatus = ["OPENED", "CLOSED"] as const
export type ClientConversationStatus = (typeof ClientConversationStatus)[number]

export const PeerUserStatus = ["ONLINE", "OFFLINE"] as const
export type PeerUserStatus = (typeof PeerUserStatus)[number]
export const userStatus = Object.fromEntries(PeerUserStatus.map((item) => [item, item])) as {
  [K in PeerUserStatus]: K
}

const userActiveConversation = z.strictObject({
  conversationId: compositeConversationId,
  status: z.enum(ClientConversationStatus),
})
export const setUserActiveConversationFrameSchema = wsFrame(
  WS_USER_ACTION,
  WS_USER_OP.conversation,
  userActiveConversation,
)

export type userActiveConversation = z.infer<typeof userActiveConversation>

// ---- server → client: events and acks ----

export const userPeerStatusEventSchema = z.strictObject({
  type: z.literal(WS_USER_ACK_TYPE.peerStatus),
  status: z.enum(PeerUserStatus),
})
export const userWsGroup = defineWsGroup({
  action: WS_USER_ACTION,
  ops: {
    [WS_USER_OP.conversation]: setUserActiveConversationFrameSchema,
  },
})
