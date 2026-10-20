import {conversationsDao} from "@repo/api/dao";
import type {UserMemberConversation} from "@repo/types/schema";

export const chatPageConversationsService = async ({userId, pageSize}: {
    userId: string;
    pageSize: number;
    startKey?: string;
}): Promise<{conversations: UserMemberConversation[]}> => {
    const conversations = await conversationsDao.getConversationsByUserId(userId);

    return {conversations: conversations.slice(0, pageSize)};
}
