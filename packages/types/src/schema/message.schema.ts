import z from "zod";
import {PREFIXES} from "./keys";
import {compositeConversationId, CONVERSATION_TYPE, conversationKey, type ConversationType} from "./conversation.schema";
import {userId} from "./user.schema";

const zodTimestamp = z.number().int().nonnegative();

/** Hard cap for a text message body, enforced at the schema level everywhere. */
export const MAX_MESSAGE_LENGTH = 4000;
/** Hard cap for a single attachment (25 MB). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Crockford base32 ULID: 10 chars of timestamp + 16 chars of randomness. */
export const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid ULID");

export const MESSAGE_TYPE = ["TEXT", "IMAGE", "DOC", "AUDIO"] as const;
export type MessageType = typeof MESSAGE_TYPE[number];

/** Sort key of a message item: `MESSAGE#<ulid>`. */
export const messageSK = z.string().regex(/^MESSAGE#[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid message SK");

export const messageAttachment = z.strictObject({
    url: z.url(),
    mimeType: z.string().min(1).max(255),
    sizeBytes: z.int().positive().max(MAX_ATTACHMENT_BYTES),
    fileName: z.string().min(1).max(255).optional(),
    /** Audio duration in milliseconds; required for AUDIO messages. */
    durationMs: z.int().positive().optional(),
    /** Optional image preview; used for IMAGE messages. */
    thumbnailUrl: z.url().optional(),
});

export type MessageAttachment = z.infer<typeof messageAttachment>;

/** Shared content invariants between the stored item and the API-facing shape. */
export const refineMessageContent = (
    data: {type: MessageType; body?: string; attachment?: MessageAttachment},
    ctx: z.RefinementCtx,
) => {
    if (data.type === "TEXT") {
        if (!data.body) {
            ctx.addIssue({code: "custom", message: "Text messages require a body", path: ["body"]});
        }
        if (data.attachment) {
            ctx.addIssue({code: "custom", message: "Text messages cannot have an attachment", path: ["attachment"]});
        }
        return;
    }
    if (data.body) {
        ctx.addIssue({code: "custom", message: "Only text messages can have a body", path: ["body"]});
    }
    if (!data.attachment) {
        ctx.addIssue({code: "custom", message: "Media messages require an attachment", path: ["attachment"]});
    }
    if (data.type === "AUDIO" && !data.attachment?.durationMs) {
        ctx.addIssue({code: "custom", message: "Audio messages require durationMs", path: ["attachment", "durationMs"]});
    }
};

/**
 * A message item as stored in DynamoDB, living under its conversation's partition:
 * `PK CONVERSATION#<type>#<id>`, `SK MESSAGE#<ulid>`. `conversationId` is the
 * composite `TYPE#id` value clients use everywhere. ULID sort keys keep messages
 * in chronological order per conversation. Timestamps are epoch milliseconds and
 * are populated by the DAO, never by callers.
 */
const messageItemBase = z.strictObject({
    PK: conversationKey,
    SK: messageSK,
    messageId: ulid,
    conversationId: compositeConversationId,
    senderId: userId,
    type: z.enum(MESSAGE_TYPE),
    body: z.string().min(1).max(MAX_MESSAGE_LENGTH).optional(),
    attachment: messageAttachment.optional(),
    createdAt: zodTimestamp,
    updatedAt: zodTimestamp,
    editedAt: zodTimestamp.optional(),
    /** Soft-delete marker; deleted messages keep their storage row for history sync. */
    deletedAt: zodTimestamp.optional(),
});

/** `.omit()` must run on the refinement-free base; zod v4 rejects refinements there. */
export const messageItem = messageItemBase.superRefine(refineMessageContent);

/**
 * The message shape returned by the DAO and exposed through the API.
 * Non-strict, so a full DynamoDB item can be parsed directly: `PK`/`SK` are dropped.
 */
export const messageSchema = z.object(
    messageItemBase.omit({PK: true, SK: true}).shape,
).superRefine(refineMessageContent);

/** A new message: identity and storage attributes are supplied by the DAO. */
export const createMessageSchema = z.strictObject({
    conversationId: compositeConversationId,
    senderId: userId,
    type: z.enum(MESSAGE_TYPE),
    body: z.string().min(1).max(MAX_MESSAGE_LENGTH).optional(),
    attachment: messageAttachment.optional(),
}).superRefine(refineMessageContent);

/** A message edit; only TEXT messages are editable. */
export const editMessageSchema = z.strictObject({
    conversationId: compositeConversationId,
    messageId: ulid,
    body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});

/** Identifies the message to delete. */
export const deleteMessageSchema = z.strictObject({
    conversationId: compositeConversationId,
    messageId: ulid,
});

export const MESSAGE_SK_PREFIX = PREFIXES.MESSAGE;

/** A message as returned by the DAO and exposed through the API. */
export type Message = z.infer<typeof messageSchema>;
/** A message exactly as stored in DynamoDB. */
export type MessageItem = z.infer<typeof messageItem>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;
export type {ConversationType};
