export const conversationsTableName = "conversations";

export const CONVERSATION_TYPES = ["direct", "group", "support"] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export const conversationIndexes = {
    createdBy: "createdBy_lastMessageAt_GSI",
    assignedAgentId: "assignedAgentId_lastMessageAt_GSI",
    type: "type_lastMessageAt_GSI",
} as const;

/** Denormalised last-message cache kept on the conversation item. */
export type ConversationLastMessage = {
    messageId: string;
    preview: string;
    senderId: string;
    at: number;
};

export type ConversationMetadata = Record<string, string | number | boolean>;

/**
 * A row in the conversations table.
 * Partition key: `conversationId`.
 */
export type Conversation = {
    conversationId: string;
    type: ConversationType;
    name?: string;
    createdBy: string;
    assignedAgentId?: string;
    isClosed: boolean;
    lastMessage?: ConversationLastMessage;
    /** Mirrors `lastMessage.at`; top-level so it can be an index sort key. */
    lastMessageAt?: number;
    metadata?: ConversationMetadata;
    createdAt: number;
    updatedAt: number;
};

export type ConversationKey = Pick<Conversation, "conversationId">;

export type CreateConversationInput = Omit<
    Conversation,
    "conversationId" | "createdAt" | "updatedAt" | "isClosed" | "lastMessage" | "lastMessageAt"
> & {
    isClosed?: boolean;
    /** Extra members added alongside `createdBy` / `assignedAgentId`. */
    participantIds?: string[];
};

export type UpdateConversationInput = Pick<Conversation, "conversationId"> &
    Partial<Omit<Conversation, "conversationId" | "createdAt">>;
