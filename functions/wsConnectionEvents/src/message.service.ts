import {messagesDao, usersDao} from "@repo/api/dao";
import {ApiException, parseConversationId, parseOrThrow} from "@repo/api/utils";
import {
    messageCreatedEventSchema,
    messageDeletedEventSchema,
    messageUpdatedEventSchema,
    WS_MESSAGE_EVENT_TYPE,
    type Message,
    type MessageAttachment,
} from "@repo/types/schema";

type PostToConnection = (connectionId: string, body: unknown) => Promise<void>;

/** Splits `TYPE#id`; a malformed id is a client error. */
const conversationRef = (conversationId: string): {type: string; conversationId: string} => {
    try {
        return parseConversationId(conversationId);
    } catch {
        throw new ApiException(422, {message: `Invalid conversation id "${conversationId}"`});
    }
};

/**
 * Confirms the caller is a participant by checking that the storage part of the
 * conversation id (`user1#user2`) contains the userId from the access token, or
 * throws 403.
 */
const assertConversationAccess = async ({userId, conversationId}: {
    userId: string;
    conversationId: string;
}): Promise<void> => {
    const {type, conversationId: storageId} = conversationRef(conversationId);

    if (type === "DIRECT" && !storageId.split("#").includes(userId)) {
        throw new ApiException(403, {message: "You are not a participant of this conversation"});
    }
};

/** Open sockets of the peer(s) taken from the conversation id; per-socket failures are logged, not fatal. */
const fanOut = async ({userId, conversationId, payload, postToConnection}: {
    userId: string;
    conversationId: string;
    payload: unknown;
    postToConnection: PostToConnection;
}): Promise<void> => {
    const peerIds = conversationRef(conversationId).conversationId.split("#").filter((id) => id !== userId);

    const connectionIds = (await Promise.all(
        peerIds.map(async (peer) => usersDao.getUserConnections({userId: peer})),
    )).flat();

    await Promise.allSettled(
        connectionIds.map(async (connectionId) => postToConnection(connectionId, payload)),
    );
};

/** Wraps unexpected DAO failures; `ApiException`s pass through untouched. */
const asApiError = (error: unknown, context: string): ApiException => {
    if (error instanceof ApiException) return error;
    console.error(context, error);
    return new ApiException(500, {message: "Internal error. Please try again."});
};

export const sendMessageService = async ({senderId, message, postToConnection}: {
    senderId: string;
    message: {conversationId: string; type: "TEXT" | "IMAGE" | "DOC" | "AUDIO"; body?: string; attachment?: MessageAttachment};
    postToConnection: PostToConnection;
}): Promise<Message> => {
    try {
        await assertConversationAccess({userId: senderId, conversationId: message.conversationId});

        const created = await messagesDao.createMessage({...message, senderId});

        await fanOut({
            userId: senderId,
            conversationId: message.conversationId,
            payload: parseOrThrow(messageCreatedEventSchema, {type: WS_MESSAGE_EVENT_TYPE.created, message: created}),
            postToConnection,
        });

        return created;
    } catch (error) {
        throw asApiError(error, `message.send failed for ${senderId}`);
    }
};

export const editMessageService = async ({editorId, edit, postToConnection}: {
    editorId: string;
    edit: {conversationId: string; messageId: string; body: string};
    postToConnection: PostToConnection;
}): Promise<Message> => {
    try {
        await assertConversationAccess({userId: editorId, conversationId: edit.conversationId});

        const existing = await messagesDao.getMessageById(edit);
        if (!existing) throw new ApiException(404, {message: "Message not found"});
        if (existing.senderId !== editorId) {
            throw new ApiException(403, {message: "You can only edit your own messages"});
        }

        await messagesDao.editMessage(edit);

        const updated = await messagesDao.getMessageById(edit);
        if (!updated) throw new ApiException(404, {message: "Message not found"});

        await fanOut({
            userId: editorId,
            conversationId: edit.conversationId,
            payload: parseOrThrow(messageUpdatedEventSchema, {type: WS_MESSAGE_EVENT_TYPE.updated, message: updated}),
            postToConnection,
        });

        return updated;
    } catch (error) {
        throw asApiError(error, `message.edit failed for ${editorId}`);
    }
};

export const deleteMessageService = async ({deleterId, target, postToConnection}: {
    deleterId: string;
    target: {conversationId: string; messageId: string};
    postToConnection: PostToConnection;
}): Promise<{messageId: string; conversationId: string; deletedAt: number}> => {
    try {
        await assertConversationAccess({userId: deleterId, conversationId: target.conversationId});

        const existing = await messagesDao.getMessageById(target);
        if (!existing) throw new ApiException(404, {message: "Message not found"});
        if (existing.senderId !== deleterId) {
            throw new ApiException(403, {message: "You can only delete your own messages"});
        }

        await messagesDao.deleteMessage(target);
        const deletedAt = Date.now();

        await fanOut({
            userId: deleterId,
            conversationId: target.conversationId,
            payload: parseOrThrow(messageDeletedEventSchema, {type: WS_MESSAGE_EVENT_TYPE.deleted, ...target, deletedAt}),
            postToConnection,
        });

        return {...target, deletedAt};
    } catch (error) {
        throw asApiError(error, `message.delete failed for ${deleterId}`);
    }
};

export const listMessagesService = async ({userId, list}: {
    userId: string;
    list: {conversationId: string; cursor?: string; limit: number};
}): Promise<{messages: Message[]; nextCursor?: string}> => {
    try {
        await assertConversationAccess({userId, conversationId: list.conversationId});

        const messages = await messagesDao.getMessagesByConversationId(list);

        const oldest = messages.at(-1);
        return {
            messages,
            // More pages exist only when the page came back full.
            nextCursor: messages.length === list.limit && oldest ? oldest.messageId : undefined,
        };
    } catch (error) {
        throw asApiError(error, `message.list failed for ${userId}`);
    }
};