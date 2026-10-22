import z, {type ZodType} from "zod";
import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TYPE,
    compositeConversationId,
    messageAttachment,
    refineMessageContent,
    ulid,
} from "../schema";

import {WS_MESSAGE_ACTION, WS_MESSAGE_OP, type WsMessageOp} from "../schema";

/** Tuple mirror of `WS_MESSAGE_OP` values, for `z.enum`. */
export const MESSAGES_WS_OP = Object.values(WS_MESSAGE_OP) as [WsMessageOp, ...WsMessageOp[]];
export type MessagesWsOp = WsMessageOp;

/** WS events carry no `query`/`params`, so this does not build on `baseSchema`. */
export const wsFrameSchema = z.strictObject({
    action: z.enum([WS_MESSAGE_ACTION]),
    op: z.enum(MESSAGES_WS_OP),
    data: z.record(z.string(), z.unknown()).optional(),
});

const frameEnvelope = <T extends z.ZodType>(op: MessagesWsOp, data: T) =>
    z.strictObject({
        action: z.literal(WS_MESSAGE_ACTION),
        op: z.literal(op),
        data,
    });

const sendMessageData = z.strictObject({
    conversationId: compositeConversationId,
    type: z.enum(MESSAGE_TYPE),
    body: z.string().min(1).max(MAX_MESSAGE_LENGTH).optional(),
    attachment: messageAttachment.optional(),
}).superRefine(refineMessageContent);

export const sendMessageFrameSchema = frameEnvelope("send", sendMessageData);

const editMessageData = z.strictObject({
    conversationId: compositeConversationId,
    messageId: ulid,
    body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});

export const editMessageFrameSchema = frameEnvelope("edit", editMessageData);

const deleteMessageData = z.strictObject({
    conversationId: compositeConversationId,
    messageId: ulid,
});

export const deleteMessageFrameSchema = frameEnvelope("delete", deleteMessageData);

const listMessageData = z.strictObject({
    conversationId: compositeConversationId,
    /** ULID of the last message from the previous page; pages strictly older messages. */
    cursor: ulid.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
});

export const listMessagesFrameSchema = frameEnvelope("list", listMessageData);

export const MAX_WS_FRAME_BYTES = 64 * 1024;

/** Schema per `MESSAGES_WS_OP`; the Lambda picks one by the frame's `op`. */
export const MESSAGES_OP_SCHEMAS: Record<MessagesWsOp, ZodType> = {
    "send": sendMessageFrameSchema,
    "edit": editMessageFrameSchema,
    "delete": deleteMessageFrameSchema,
    "list": listMessagesFrameSchema,
};

export type WsFrameRequest = z.infer<typeof wsFrameSchema>;
export type SendMessageFrameRequest = z.infer<typeof sendMessageFrameSchema>;
export type EditMessageFrameRequest = z.infer<typeof editMessageFrameSchema>;
export type DeleteMessageFrameRequest = z.infer<typeof deleteMessageFrameSchema>;
export type ListMessagesFrameRequest = z.infer<typeof listMessagesFrameSchema>;