import {conversationsDao} from "@repo/api/dao";
import type {Conversation} from "@repo/api/types";

export const chatPageConversationsService = async ({userId, pageSize}: {
    userId: string;
    pageSize: number;
    startKey?: string;
}): Promise<{conversations: Conversation[]}> => {
    const conversations = await conversationsDao.getConversationsByUserId(userId);

    return {conversations: conversations.slice(0, pageSize)};
}
