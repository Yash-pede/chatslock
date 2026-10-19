import {conversationsDao} from "@repo/api/dao";
import {HTTPException} from "hono/http-exception";

export type ConversationItem = {
    conversationId: string;
    type: string;
    name: string | null;
    createdBy: string;
    assignedAgentId: string | null;
    isClosed: boolean;
    lastMessage: unknown;
    lastMessageAt: number | null;
    createdAt: number;
    updatedAt: number;
    unreadCount: number;
    muted: boolean;
    notificationsEnabled: boolean;
    role: string;
};

/**
 * One page of the caller's conversations. The list is read from the
 * participants index (one row per conversation the user belongs to) and the
 * conversation rows are batch-fetched on top.
 */
export const listUserConversations = async ({userId, limit, cursor}: {
    userId: string;
    limit: number;
    cursor?: string;
}): Promise<{ items: ConversationItem[]; nextCursor: string | null }> => {
    try {
        // TODO: create the conversations DAO object for the single-table design, then restore this call.
        // const {items, nextCursor} = await conversationsDao.listUserConversations({userId, limit, cursor});
        const {items, nextCursor} = {
            items: [] as Awaited<ReturnType<typeof conversationsDao.listUserConversations>>["items"],
            nextCursor: null as Awaited<ReturnType<typeof conversationsDao.listUserConversations>>["nextCursor"],
        };

        const rows = items
            .map(({conversation, participant}) => ({
                conversationId: conversation.conversationId,
                type: conversation.type,
                name: conversation.name ?? null,
                createdBy: conversation.createdBy,
                assignedAgentId: conversation.assignedAgentId ?? null,
                isClosed: conversation.isClosed,
                lastMessage: conversation.lastMessage ?? null,
                lastMessageAt: conversation.lastMessageAt ?? null,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                unreadCount: participant.unreadCount,
                muted: participant.muted,
                notificationsEnabled: participant.notificationsEnabled,
                role: participant.role,
            }))
            .sort(
                (a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt),
            );

        return {items: rows, nextCursor};
    } catch (err) {
        console.error("Failed to list conversations", err);
        if (err instanceof HTTPException) throw err;
        throw new HTTPException(500, {message: "Failed to list conversations"});
    }
};
