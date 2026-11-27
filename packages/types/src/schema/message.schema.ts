import z from "zod"
import { PREFIXES, messageIdSchema } from "./keys"
import {
  compositeConversationId,
  conversationKey,
  type ConversationType,
} from "./conversation.schema"
import { userId } from "./user.schema"
import { ulid } from "./ulid.schema"

export { ulid }
export { messageIdSchema, type MessageId } from "./keys"

const zodTimestamp = z.number().int().nonnegative()

/** Hard cap for a text message body, enforced at the schema level everywhere. */
export const MAX_MESSAGE_LENGTH = 4000 as const
/** Hard cap for a single attachment (100 MB). */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024

/** Editing and deleting are only allowed this long after the message was created. */
export const MESSAGE_ACTION_WINDOW_MS = 15 * 60 * 1000

/** Message identity: the ULID that keys the item (`SK MESSAGE#<uid>`). */
export type MessageUID = z.infer<typeof ulid>

export const MESSAGE_TYPE = ["TEXT", "IMAGE", "DOC", "AUDIO"] as const
export type MessageType = (typeof MESSAGE_TYPE)[number]

/** Sort key of a message item: `MESSAGE#<ulid>`. */
export const messageSK = z.string().regex(/^MESSAGE#[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid message SK")

export const messageAttachment = z.strictObject({
  url: z.url(),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.int().positive().max(MAX_ATTACHMENT_BYTES),
  fileName: z.string().min(1).max(255).optional(),
  /** Audio duration in milliseconds; required for AUDIO messages. */
  durationMs: z.int().positive().optional(),
  /** Optional image preview; used for IMAGE messages. */
  thumbnailUrl: z.url().optional(),
})

export type MessageAttachment = z.infer<typeof messageAttachment>

/** Shared content invariants between the stored item and the API-facing shape. */
export const refineMessageContent = (
  data: {
    type: MessageType
    body?: string
    attachment?: MessageAttachment
    deletedAt?: number
  },
  ctx: z.RefinementCtx,
) => {
  // Soft-deleted rows intentionally lose their body/attachment.
  if (data.deletedAt) return

  if (data.type === "TEXT") {
    if (!data.body) {
      ctx.addIssue({ code: "custom", message: "Text messages require a body", path: ["body"] })
    }
    if (data.attachment) {
      ctx.addIssue({
        code: "custom",
        message: "Text messages cannot have an attachment",
        path: ["attachment"],
      })
    }
    return
  }
  if (data.body) {
    ctx.addIssue({ code: "custom", message: "Only text messages can have a body", path: ["body"] })
  }
  if (!data.attachment) {
    ctx.addIssue({
      code: "custom",
      message: "Media messages require an attachment",
      path: ["attachment"],
    })
  }
  if (data.type === "AUDIO" && !data.attachment?.durationMs) {
    ctx.addIssue({
      code: "custom",
      message: "Audio messages require durationMs",
      path: ["attachment", "durationMs"],
    })
  }
}

/**
 * A message item as stored in DynamoDB, living under its conversation's partition:
 * `PK CONVERSATION#<type>#<id>`, `SK MESSAGE#<uid>`. `conversationId` is the
 * composite `TYPE#id` value clients use everywhere. `uid` (ULID) identifies the
 * row and `messageId` is the numeric per-conversation sequence the
 * `MessageIdSequence_GSI` indexes for pagination. Timestamps are epoch
 * milliseconds and are populated by the DAO, never by callers.
 */
const messageItemBase = z.strictObject({
  PK: conversationKey,
  SK: messageSK,
  uid: ulid,
  messageId: z.number().int().positive(),
  conversationId: compositeConversationId,
  senderId: userId,
  peerId: userId,
  type: z.enum(MESSAGE_TYPE),
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH).optional(),
  attachment: messageAttachment.optional(),
  createdAt: zodTimestamp,
  editedAt: zodTimestamp.optional(),
  deletedAt: zodTimestamp.optional(),
  expiresAt: zodTimestamp,
  version: z.number(),
  isForwarded: z.boolean().default(false),
  /** UID of the message being replied to. */
  replyTo: ulid.optional(),
})

/** `.omit()` must run on the refinement-free base; zod v4 rejects refinements there. */
export const messageItem = messageItemBase.superRefine(refineMessageContent)

/**
 * The message shape returned by the DAO and exposed through the API: both the
 * `uid` (identity) and the string `messageId` (sequence) are always present.
 * Non-strict, so a full DynamoDB item can be parsed directly: `PK`/`SK` are
 * dropped and the numeric sequence fields are coerced to their string form.
 */
export const messageSchema = z
  .object({
    ...messageItemBase.omit({ PK: true, SK: true, expiresAt: true }).shape,
    messageId: messageIdSchema,
    replyTo: ulid.optional(),
  })
  .superRefine(refineMessageContent)

/** A new message: identity and storage attributes are supplied by the DAO. */
export const createMessageSchema = z
  .strictObject({
    conversationId: compositeConversationId,
    senderId: userId,
    /** The other participant, derived from the conversation id by the service. */
    peerId: userId,
    type: z.enum(MESSAGE_TYPE),
    body: z.string().min(1).max(MAX_MESSAGE_LENGTH).optional(),
    attachment: messageAttachment.optional(),
    replyTo: ulid.optional(),
    isForwarded: z.boolean().default(false),
  })
  .superRefine(refineMessageContent)

/** A message edit; only TEXT messages are editable. Identified by its `uid`. */
export const editMessageSchema = z.strictObject({
  conversationId: compositeConversationId,
  uid: ulid,
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
})

/** Identifies the message to delete by its `uid`. */
export const deleteMessageSchema = z.strictObject({
  conversationId: compositeConversationId,
  uid: ulid,
})

export const MESSAGE_SK_PREFIX = PREFIXES.MESSAGE

/** A message as returned by the DAO and exposed through the API. */
export type Message = z.infer<typeof messageSchema>
/** A message exactly as stored in DynamoDB. */
export type MessageItem = z.infer<typeof messageItem>
export type CreateMessageInput = z.infer<typeof createMessageSchema>
export type EditMessageInput = z.infer<typeof editMessageSchema>
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>
export type { ConversationType }

export const MESSAGE_ID_SEQUENCE_GSI = "MessageIdSequence_GSI"
