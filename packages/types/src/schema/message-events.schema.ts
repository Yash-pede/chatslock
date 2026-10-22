import z from "zod";
import {compositeConversationId} from "./conversation.schema";
import {messageSchema, ulid} from "./message.schema";
import {WS_EVENT_TYPE, WS_MESSAGE_ACK_TYPE, WS_MESSAGE_EVENT_TYPE} from "./ws.schema";

const zodTimestamp = z.number().int().nonnegative();

const messageDeletedBody = z.strictObject({
    messageId: ulid,
    conversationId: compositeConversationId,
    deletedAt: zodTimestamp,
});

/**
 * Server → client payloads. Fan-out events go to every connection in the
 * conversation; acks are the route reply body delivered only to the caller
 * that performed the action.
 */
export const messageCreatedEventSchema = z.strictObject({
    type: z.literal(WS_MESSAGE_EVENT_TYPE.created),
    message: messageSchema,
});

export const messageUpdatedEventSchema = z.strictObject({
    type: z.literal(WS_MESSAGE_EVENT_TYPE.updated),
    message: messageSchema,
});

export const messageDeletedEventSchema = z.strictObject({
    type: z.literal(WS_MESSAGE_EVENT_TYPE.deleted),
    ...messageDeletedBody.shape,
});

export const messageEventSchema = z.discriminatedUnion("type", [
    messageCreatedEventSchema,
    messageUpdatedEventSchema,
    messageDeletedEventSchema,
]);

/** Ack for a sent message; shape mirrors `messageCreatedEventSchema`. */
export const messageSentAckSchema = z.strictObject({
    type: z.literal(WS_MESSAGE_ACK_TYPE.sent),
    message: messageSchema,
});

export const messageEditedAckSchema = z.strictObject({
    type: z.literal(WS_MESSAGE_ACK_TYPE.edited),
    message: messageSchema,
});

export const messageDeletedAckSchema = z.strictObject({
    type: z.literal(WS_MESSAGE_ACK_TYPE.deleted),
    ...messageDeletedBody.shape,
});

export const messageListAckSchema = z.strictObject({
    type: z.literal(WS_MESSAGE_ACK_TYPE.list),
    messages: z.array(messageSchema),
    /** ULID of the oldest message on the page; present only when more pages exist. */
    nextCursor: ulid.optional(),
});

export const wsErrorAckSchema = z.strictObject({
    type: z.literal(WS_EVENT_TYPE.error),
    code: z.string().optional(),
    message: z.string(),
});

export const messageAckSchema = z.discriminatedUnion("type", [
    messageSentAckSchema,
    messageEditedAckSchema,
    messageDeletedAckSchema,
    messageListAckSchema,
    wsErrorAckSchema,
]);

export type MessageCreatedEvent = z.infer<typeof messageCreatedEventSchema>;
export type MessageUpdatedEvent = z.infer<typeof messageUpdatedEventSchema>;
export type MessageDeletedEvent = z.infer<typeof messageDeletedEventSchema>;
export type MessageEvent = z.infer<typeof messageEventSchema>;
export type MessageSentAck = z.infer<typeof messageSentAckSchema>;
export type MessageEditedAck = z.infer<typeof messageEditedAckSchema>;
export type MessageDeletedAck = z.infer<typeof messageDeletedAckSchema>;
export type MessageListAck = z.infer<typeof messageListAckSchema>;
export type WsErrorAck = z.infer<typeof wsErrorAckSchema>;
export type MessageAck = z.infer<typeof messageAckSchema>;
