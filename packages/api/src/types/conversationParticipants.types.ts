export const PARTICIPANT_ROLES = ["owner", "admin", "member"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const conversationParticipantIndexes = {
    user: "userId_conversationId_GSI",
} as const;

/**
 * A row in the conversation_participants table.
 * Partition key: `conversationId`, sort key: `userId`.
 */
export type ConversationParticipant = {
    conversationId: string;
    userId: string;
    role: ParticipantRole;
    muted: boolean;
    lastReadMessageId?: string;
    lastReadAt?: number;
    unreadCount: number;
    notificationsEnabled: boolean;
    joinedAt: number;
};

export type ConversationParticipantKey = Pick<
    ConversationParticipant,
    "conversationId" | "userId"
>;

export type CreateConversationParticipantInput = Omit<
    ConversationParticipant,
    "role" | "muted" | "unreadCount" | "notificationsEnabled" | "joinedAt"
> & {
    role?: ParticipantRole;
    muted?: boolean;
    unreadCount?: number;
    notificationsEnabled?: boolean;
};

export type UpdateConversationParticipantInput = ConversationParticipantKey &
    Partial<Omit<ConversationParticipant, "conversationId" | "userId" | "joinedAt">>;
