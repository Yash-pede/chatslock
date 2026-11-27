import z from "zod"
import { compositeConversationId } from "../schema/conversation.schema"
import { userId } from "../schema/user.schema"
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_TYPE,
  messageAttachment,
  messageIdSchema,
  messageSchema,
  refineMessageContent,
  ulid,
} from "../schema/message.schema"

/** Server → client events published back to the conversation channel (`eventType`). */
export const MESSAGE_ACK_EVENT_TYPE = {
  new: "message.new",
  updated: "message.updated",
  deleted: "message.deleted",
  edited: "message.edited",
} as const
export type MessageEventType = (typeof MESSAGE_ACK_EVENT_TYPE)[keyof typeof MESSAGE_ACK_EVENT_TYPE]

/** Client → server operations, published as `{ eventType, data }`. */
export const MESSAGE_EVENT = {
  send: "message.send",
  edit: "message.edit",
  delete: "message.delete",
  typing: "message.typing",
} as const
export type MessageEvent = (typeof MESSAGE_EVENT)[keyof typeof MESSAGE_EVENT]

const clientIdSchema = z.string().max(32).optional()

// ---- client → server: `data` only; the conversation id comes from the channel ----

const sendMessageFields = {
  type: z.enum(MESSAGE_TYPE),
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH).optional(),
  attachment: messageAttachment.optional(),
  clientId: clientIdSchema,
  isForwarded: z.boolean().optional(),
  /** UID of the message being replied to. */
  replyTo: ulid.optional(),
}

export const sendMessageData = z.strictObject(sendMessageFields).superRefine(refineMessageContent)

export const editMessageData = z.strictObject({
  uid: ulid,
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  clientId: clientIdSchema,
})

export const deleteMessageData = z.strictObject({
  uid: ulid,
  clientId: clientIdSchema,
})

/** Ephemeral typing state; the Lambda validates `userId` against the caller. */
export const TYPING_STATUS = ["START", "STOP"] as const
export type TypingStatus = (typeof TYPING_STATUS)[number]

export const messageTypingData = z.strictObject({
  userId,
  status: z.enum(TYPING_STATUS),
})
export type MessageTypingData = z.infer<typeof messageTypingData>

export const sendMessageReq = z
  .strictObject({ conversationId: compositeConversationId, ...sendMessageFields })
  .superRefine(refineMessageContent)

export const editMessageReq = z.strictObject({
  conversationId: compositeConversationId,
  ...editMessageData.shape,
})

export const deleteMessageReq = z.strictObject({
  conversationId: compositeConversationId,
  ...deleteMessageData.shape,
})

// ---- server → client: events and acks ----

const messageDeletedBody = z.strictObject({
  uid: ulid,
  messageId: messageIdSchema,
  conversationId: compositeConversationId,
})

const messageChangedData = z.strictObject({
  message: messageSchema,
  /** Echoed on the broadcast so the sender can replace its optimistic row. */
  clientId: clientIdSchema,
})

export const messageCreatedEventSchema = z.strictObject({
  eventType: z.literal(MESSAGE_ACK_EVENT_TYPE.new),
  data: messageChangedData,
})

export const messageUpdatedEventSchema = z.strictObject({
  eventType: z.literal(MESSAGE_ACK_EVENT_TYPE.updated),
  data: messageChangedData,
})

export const messageDeletedEventSchema = z.strictObject({
  eventType: z.literal(MESSAGE_ACK_EVENT_TYPE.deleted),
  data: messageDeletedBody,
})

export const messageEditedAckSchema = z.strictObject({
  eventType: z.literal(MESSAGE_ACK_EVENT_TYPE.edited),
  data: messageChangedData,
})

export const messageDeletedAckSchema = z.strictObject({
  eventType: z.literal(MESSAGE_ACK_EVENT_TYPE.deleted),
  data: z.strictObject({
    ...messageDeletedBody.shape,
    clientId: clientIdSchema,
  }),
})

// ---- types ----

export type SendMessageData = z.infer<typeof sendMessageData>
export type EditMessageData = z.infer<typeof editMessageData>
export type DeleteMessageData = z.infer<typeof deleteMessageData>

/**
 * The client → server publish envelope (`{ eventType, data }`). This is the same
 * schema the Lambda validates against, so the frontend type and the server
 * validation cannot drift.
 */
export const messagePublishEnvelopeSchema = z.discriminatedUnion("eventType", [
  z.strictObject({ eventType: z.literal(MESSAGE_EVENT.send), data: sendMessageData }),
  z.strictObject({ eventType: z.literal(MESSAGE_EVENT.edit), data: editMessageData }),
  z.strictObject({ eventType: z.literal(MESSAGE_EVENT.delete), data: deleteMessageData }),
  z.strictObject({ eventType: z.literal(MESSAGE_EVENT.typing), data: messageTypingData }),
])
export type MessagePublishPayload = z.infer<typeof messagePublishEnvelopeSchema>

/** Broadcast shape of a typing event (same envelope the client publishes). */
export const messageTypingEventSchema = z.strictObject({
  eventType: z.literal(MESSAGE_EVENT.typing),
  data: messageTypingData,
})
export type MessageTypingEvent = z.infer<typeof messageTypingEventSchema>

export type SendMessageReq = z.infer<typeof sendMessageReq>
export type EditMessageReq = z.infer<typeof editMessageReq>
export type DeleteMessageReq = z.infer<typeof deleteMessageReq>

export type MessageCreatedEvent = z.infer<typeof messageCreatedEventSchema>
export type MessageUpdatedEvent = z.infer<typeof messageUpdatedEventSchema>
export type MessageDeletedEvent = z.infer<typeof messageDeletedEventSchema>
export type MessageEditedAck = z.infer<typeof messageEditedAckSchema>
export type MessageDeletedAck = z.infer<typeof messageDeletedAckSchema>
