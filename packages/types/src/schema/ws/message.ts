import z from "zod"
import { compositeConversationId } from "../conversation.schema"
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_TYPE,
  messageAttachment,
  messageSchema,
  refineMessageContent,
  ulid,
} from "../message.schema"
import { clientIdSchema, defineWsGroup, wsFrame } from "./envelope"

/** Route key for every message operation. */
export const WS_MESSAGE_ACTION = "message" as const
export type WsMessageAction = typeof WS_MESSAGE_ACTION

/** Operations accepted by the `message` route. */
export const WS_MESSAGE_OP = {
  send: "send",
  edit: "edit",
  delete: "delete",
  list: "list",
  read: "read",
} as const
export type WsMessageOp = (typeof WS_MESSAGE_OP)[keyof typeof WS_MESSAGE_OP]

/** Server → client fan-out events. */
export const WS_MESSAGE_EVENT_TYPE = {
  created: "message.new",
  updated: "message.updated",
  deleted: "message.deleted",
} as const
export type WsMessageEventType = (typeof WS_MESSAGE_EVENT_TYPE)[keyof typeof WS_MESSAGE_EVENT_TYPE]

/** Direct replies to the caller of an operation. */
export const WS_MESSAGE_ACK_TYPE = {
  sent: "message.sent",
  edited: "message.edited",
  deleted: "message.deleted",
  list: "message.list",
} as const
export type WsMessageAckType = (typeof WS_MESSAGE_ACK_TYPE)[keyof typeof WS_MESSAGE_ACK_TYPE]

const zodTimestamp = z.number().int().nonnegative()

// ---- client → server: one `data` schema per op ----

const sendMessageData = z
  .strictObject({
    conversationId: compositeConversationId,
    type: z.enum(MESSAGE_TYPE),
    body: z.string().min(1).max(MAX_MESSAGE_LENGTH).optional(),
    attachment: messageAttachment.optional(),
    clientId: clientIdSchema.optional(),
  })
  .superRefine(refineMessageContent)

const editMessageData = z.strictObject({
  conversationId: compositeConversationId,
  messageId: ulid,
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  clientId: clientIdSchema.optional(),
})

const deleteMessageData = z.strictObject({
  conversationId: compositeConversationId,
  messageId: ulid,
  clientId: clientIdSchema.optional(),
})

const listMessageData = z.strictObject({
  conversationId: compositeConversationId,
  /** ULID of the last message from the previous page; pages strictly older messages. */
  cursor: ulid.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(25),
  clientId: clientIdSchema.optional(),
})

const readMessageData = z.strictObject({
  conversationId: compositeConversationId,
  clientId: clientIdSchema.optional(),
})

export const sendMessageFrameSchema = wsFrame(
  WS_MESSAGE_ACTION,
  WS_MESSAGE_OP.send,
  sendMessageData,
)
export const editMessageFrameSchema = wsFrame(
  WS_MESSAGE_ACTION,
  WS_MESSAGE_OP.edit,
  editMessageData,
)
export const deleteMessageFrameSchema = wsFrame(
  WS_MESSAGE_ACTION,
  WS_MESSAGE_OP.delete,
  deleteMessageData,
)
export const listMessagesFrameSchema = wsFrame(
  WS_MESSAGE_ACTION,
  WS_MESSAGE_OP.list,
  listMessageData,
)
export const readMessageFrameSchema = wsFrame(
  WS_MESSAGE_ACTION,
  WS_MESSAGE_OP.read,
  readMessageData,
)

// ---- server → client: events and acks ----

const messageDeletedBody = z.strictObject({
  messageId: ulid,
  conversationId: compositeConversationId,
  deletedAt: zodTimestamp,
})

export const messageCreatedEventSchema = z.strictObject({
  type: z.literal(WS_MESSAGE_EVENT_TYPE.created),
  message: messageSchema,
})

export const messageUpdatedEventSchema = z.strictObject({
  type: z.literal(WS_MESSAGE_EVENT_TYPE.updated),
  message: messageSchema,
})

export const messageDeletedEventSchema = z.strictObject({
  type: z.literal(WS_MESSAGE_EVENT_TYPE.deleted),
  ...messageDeletedBody.shape,
})

export const messageSentAckSchema = z.strictObject({
  type: z.literal(WS_MESSAGE_ACK_TYPE.sent),
  message: messageSchema,
  clientId: clientIdSchema.optional(),
})

export const messageEditedAckSchema = z.strictObject({
  type: z.literal(WS_MESSAGE_ACK_TYPE.edited),
  message: messageSchema,
  clientId: clientIdSchema.optional(),
})

export const messageDeletedAckSchema = z.strictObject({
  type: z.literal(WS_MESSAGE_ACK_TYPE.deleted),
  ...messageDeletedBody.shape,
  clientId: clientIdSchema.optional(),
})

export const messageListAckSchema = z.strictObject({
  type: z.literal(WS_MESSAGE_ACK_TYPE.list),
  messages: z.array(messageSchema),
  /** ULID of the oldest message on the page; present only when more pages exist. */
  nextCursor: ulid.optional(),
  clientId: clientIdSchema.optional(),
})

// ---- the whole `message` group in one place ----

/**
 * Adding a message operation means adding one entry to `ops`; the Lambda reads
 * these schemas to validate the frame and the client can reuse the same types.
 */
export const messageWsGroup = defineWsGroup({
  action: WS_MESSAGE_ACTION,
  ops: {
    [WS_MESSAGE_OP.send]: sendMessageFrameSchema,
    [WS_MESSAGE_OP.edit]: editMessageFrameSchema,
    [WS_MESSAGE_OP.delete]: deleteMessageFrameSchema,
    [WS_MESSAGE_OP.list]: listMessagesFrameSchema,
    [WS_MESSAGE_OP.read]: readMessageFrameSchema,
  },
})

// ---- types ----

export type SendMessageData = z.infer<typeof sendMessageData>
export type EditMessageData = z.infer<typeof editMessageData>
export type DeleteMessageData = z.infer<typeof deleteMessageData>
export type ListMessageData = z.infer<typeof listMessageData>
export type ReadMessageData = z.infer<typeof readMessageData>

export type MessageCreatedEvent = z.infer<typeof messageCreatedEventSchema>
export type MessageUpdatedEvent = z.infer<typeof messageUpdatedEventSchema>
export type MessageDeletedEvent = z.infer<typeof messageDeletedEventSchema>
export type MessageSentAck = z.infer<typeof messageSentAckSchema>
export type MessageEditedAck = z.infer<typeof messageEditedAckSchema>
export type MessageDeletedAck = z.infer<typeof messageDeletedAckSchema>
export type MessageListAck = z.infer<typeof messageListAckSchema>
