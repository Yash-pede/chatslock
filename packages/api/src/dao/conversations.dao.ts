import {
    Conversation,
    ConversationParticipant,
    CreateConversationInput,
} from "../types";

// TODO: recreate the conversations DAO against the single-table DynamoDB design.
export const conversationsDao = {
    createConversation: async (_input: CreateConversationInput): Promise<Conversation | undefined> => {
        return undefined;
    },
    listUserConversations: async (_input: {
        userId: string;
        limit: number;
        cursor?: string;
    }): Promise<{ items: { conversation: Conversation; participant: ConversationParticipant }[]; nextCursor: string | null }> => {
        return {items: [], nextCursor: null};
    },
    getConversationsByIds: async (_input: { conversationIds: string[] }): Promise<Conversation[]> => {
        return [];
    },
}
