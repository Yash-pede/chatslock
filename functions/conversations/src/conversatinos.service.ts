import {conversationsDao, usersDao} from "@repo/api/dao";
import type {ConversationUserProfile, UserMemberConversation} from "@repo/types/schema";

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
