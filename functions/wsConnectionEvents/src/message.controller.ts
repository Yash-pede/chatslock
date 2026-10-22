import type {WsContext, WsReply} from "@repo/api/core";
import type {
    DeleteMessageFrameRequest,
    EditMessageFrameRequest,
    ListMessagesFrameRequest,
    SendMessageFrameRequest,
} from "@repo/types/req";
import {ApiException, parseOrThrow} from "@repo/api/utils";
import {
    messageDeletedAckSchema,
    messageEditedAckSchema,
    messageListAckSchema,
    messageSentAckSchema,
    WS_EVENT_TYPE,
    WS_MESSAGE_ACK_TYPE,
    wsErrorAckSchema,
} from "@repo/types/schema";
import {
    deleteMessageService,
    editMessageService,
    listMessagesService,
    sendMessageService,
} from "./message.service";

export const sendMessageController = async (c: WsContext): Promise<WsReply | void> => {
    const {data} = c.get<SendMessageFrameRequest>("valid") ?? {data: undefined};
    if (!c.userId || !data) return c.reply(401);

    try {
        const message = await sendMessageService({
            senderId: c.userId,
            message: data,
            postToConnection: c.postToConnection,
        });

        return c.reply(200, parseOrThrow(messageSentAckSchema, {type: WS_MESSAGE_ACK_TYPE.sent, message}));
    } catch (error) {
        return wsErrorResponse(c, error);
    }
};

export const editMessageController = async (c: WsContext): Promise<WsReply | void> => {
    const {data} = c.get<EditMessageFrameRequest>("valid") ?? {data: undefined};
    if (!c.userId || !data) return c.reply(401);

    try {
        const message = await editMessageService({
            editorId: c.userId,
            edit: data,
            postToConnection: c.postToConnection,
        });

        return c.reply(200, parseOrThrow(messageEditedAckSchema, {type: WS_MESSAGE_ACK_TYPE.edited, message}));
    } catch (error) {
        return wsErrorResponse(c, error);
    }
};

export const deleteMessageController = async (c: WsContext): Promise<WsReply | void> => {
    const {data} = c.get<DeleteMessageFrameRequest>("valid") ?? {data: undefined};
    if (!c.userId || !data) return c.reply(401);

    try {
        const result = await deleteMessageService({
            deleterId: c.userId,
            target: data,
            postToConnection: c.postToConnection,
        });

        return c.reply(200, parseOrThrow(messageDeletedAckSchema, {type: WS_MESSAGE_ACK_TYPE.deleted, ...result}));
    } catch (error) {
        return wsErrorResponse(c, error);
    }
};

export const listMessagesController = async (c: WsContext): Promise<WsReply | void> => {
    const {data} = c.get<ListMessagesFrameRequest>("valid") ?? {data: undefined};
    if (!c.userId || !data) return c.reply(401);

    try {
        const result = await listMessagesService({userId: c.userId, list: data});
        return c.reply(200, parseOrThrow(messageListAckSchema, {type: WS_MESSAGE_ACK_TYPE.list, ...result}));
    } catch (error) {
        return wsErrorResponse(c, error);
    }
};

const wsErrorResponse = (c: WsContext, error: unknown): WsReply => {
    if (error instanceof ApiException) {
        return c.reply(error.status, parseOrThrow(wsErrorAckSchema, {
            type: WS_EVENT_TYPE.error,
            code: error.code,
            message: error.message,
        }));
    }

    console.error("WS message action failed", error);
    return c.reply(500, parseOrThrow(wsErrorAckSchema, {
        type: WS_EVENT_TYPE.error,
        message: "Internal error. Please try again.",
    }));
};
