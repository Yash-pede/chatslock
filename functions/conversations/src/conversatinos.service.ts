import {conversationsDao, messagesDao, usersDao} from "@repo/api/dao";
import {ApiException, parseConversationId} from "@repo/api/utils";
import type {ConversationUserProfile, Message, UserMemberConversation} from "@repo/types/schema";
import {MAX_MESSAGES_LOOKUP} from "@repo/types/req";

export const chatPageConversationsService = async ({userId, pageSize}: {
    userId: string;
    pageSize: number;
    startKey?: string;
}): Promise<{conversations: UserMemberConversation[]}> => {
    const conversations = await conversationsDao.getConversationsByUserId(userId);

    return {conversations: conversations.slice(0, pageSize)};
}

/**
 * Resolve the peer profiles for a set of user ids. Direct conversation ids are
 * `u1#u2`, so the client splits the id and asks for the other participant here
 * instead of receiving full user records in the conversation list.
 */
export const conversationProfilesService = async ({userIds}: {
    userIds: string[];
}): Promise<{profiles: ConversationUserProfile[]}> => {
    const profiles = await usersDao.getPublicProfilesByIds({userIds});

    return {profiles};
}

/**
 * Latest messages of a conversation, newest first. The id is the composite
 * `TYPE#id` returned by the chat page; the caller must be a participant, which
 * for DIRECT conversations is a plain string check against `user1#user2`.
 */
export const conversationMessagesService = async ({userId, conversationId}: {
    userId: string;
    conversationId: string;
}): Promise<{messages: Message[]}> => {
    let parsed: {type: UserMemberConversation["conversationType"]; conversationId: string};
    try {
        parsed = parseConversationId(conversationId);
    } catch {
        throw new ApiException(422, {message: `Invalid conversation id "${conversationId}"`});
    }

    if (parsed.type === "DIRECT" && !parsed.conversationId.split("#").includes(userId)) {
        throw new ApiException(403, {message: "You are not a participant of this conversation"});
    }

    const messages = await messagesDao.getMessagesByConversationId({
        conversationId: conversationId,
        limit: MAX_MESSAGES_LOOKUP,
    });

    return {messages};
}
