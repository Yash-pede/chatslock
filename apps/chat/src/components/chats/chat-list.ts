import { conversationsApi, MAX_PROFILE_LOOKUP, type ConversationUserProfile } from "@/api/conversations.api";
import type { UserMemberConversation } from "@repo/types/schema";

/** A conversation joined with the other participant's public profile. */
export interface ChatListItem {
    conversationId: string;
    conversationType: UserMemberConversation["conversationType"];
    unreadCount: number;
    lastMessagePreview?: string;
    lastMessageAt?: number;
    lastMessageId?: string;
    peer: ConversationUserProfile | null;
}

/**
 * Direct conversation ids look like `conversation#direct#<u1>#<u2>` (the ids
 * are sorted) and the client-facing id is `u1#u2`, so the peer is whichever id
 * is not the caller. Keys with fewer than two ids have no peer to resolve.
 */
export function getPeerUserId(conversationId: string, currentUserId: string | null): string | null {
    const ids = conversationId.split("#").filter(Boolean);
    if (ids.length < 2) return null;

    const others = ids.filter((id) => id !== currentUserId);
    return others[0] ?? null;
}

/** Unique peer ids for a page, in first-seen order. */
export function collectPeerIds(
    conversations: UserMemberConversation[],
    currentUserId: string | null,
): string[] {
    const ids = new Set<string>();

    for (const conversation of conversations) {
        const peerId = getPeerUserId(conversation.conversationId, currentUserId);
        if (peerId) ids.add(peerId);
    }

    return [...ids];
}

/**
 * Resolve every peer profile, chunking requests to the server's per-call limit
 * so a page larger than 25 still resolves completely.
 */
export async function fetchPeerProfiles(userIds: string[]): Promise<Map<string, ConversationUserProfile>> {
    const batches: string[][] = [];
    for (let i = 0; i < userIds.length; i += MAX_PROFILE_LOOKUP) {
        batches.push(userIds.slice(i, i + MAX_PROFILE_LOOKUP));
    }

    const results = await Promise.all(batches.map((batch) => conversationsApi.getProfiles(batch)));
    const map = new Map<string, ConversationUserProfile>();

    for (const profiles of results) {
        for (const profile of profiles) map.set(profile.userId, profile);
    }

    return map;
}

/**
 * Join conversations with their peers and order them newest-activity first.
 * The membership row carries no conversation timestamp, so conversations that
 * never received a message sort last (their rows read "Get started").
 */
export function buildChatList(
    conversations: UserMemberConversation[],
    profiles: Map<string, ConversationUserProfile>,
    currentUserId: string | null,
): ChatListItem[] {
    return conversations
        .map<ChatListItem>((conversation) => {
            const peerId = getPeerUserId(conversation.conversationId, currentUserId);

            return {
                conversationId: conversation.conversationId,
                conversationType: conversation.conversationType,
                unreadCount: conversation.unreadCount,
                lastMessagePreview: conversation.lastMessagePreview,
                lastMessageAt: conversation.lastMessageAt,
                lastMessageId: conversation.lastMessageId,
                peer: peerId ? profiles.get(peerId) ?? null : null,
            };
        })
        .sort((a, b) => activityTime(b) - activityTime(a));
}

/** Sort key: last message time when present; message-less conversations go last. */
export function activityTime(item: ChatListItem): number {
    return item.lastMessageAt ?? 0;
}
