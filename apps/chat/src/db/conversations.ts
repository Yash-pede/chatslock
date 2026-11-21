import type { ConversationUserProfileWithStatus, UserMemberConversation } from "@repo/types/schema"
import { and, eq, ne, notInArray, sql } from "drizzle-orm"
import type { Database } from "./client"
import { profileRowFromApi } from "./profiles"
import { conversations, profiles, type ConversationRow } from "./schema"

export { messagePreview as conversationPreview } from "@repo/types/schema"

/**
 * One shared write for "this conversation's last message changed": called for
 * realtime message events and incoming push notifications, so the home list's
 * `lastMessageAt` ordering stays current without a refetch.
 */
export async function updateCachedConversationLastMessage(
  db: Database,
  input: {
    ownerUserId: string
    conversationId: string
    lastMessageId?: string
    lastMessagePreview: string
    lastMessageAt: number
  },
): Promise<void> {
  await db
    .update(conversations)
    .set({
      lastMessageAt: input.lastMessageAt,
      lastMessagePreview: input.lastMessagePreview,
      ...(input.lastMessageId !== undefined ? { lastMessageId: input.lastMessageId } : {}),
    })
    .where(
      and(
        eq(conversations.ownerUserId, input.ownerUserId),
        eq(conversations.conversationId, input.conversationId),
      ),
    )
}

/** Viewing a conversation clears its local unread badge immediately. */
export async function resetCachedConversationUnread(
  db: Database,
  ownerUserId: string,
  conversationId: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({ unreadCount: 0 })
    .where(
      and(
        eq(conversations.ownerUserId, ownerUserId),
        eq(conversations.conversationId, conversationId),
      ),
    )
}

/** A push notification means an unseen message: bump the local badge by one. */
export async function incrementCachedConversationUnread(
  db: Database,
  ownerUserId: string,
  conversationId: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({ unreadCount: sql<number>`${conversations.unreadCount} + 1` })
    .where(
      and(
        eq(conversations.ownerUserId, ownerUserId),
        eq(conversations.conversationId, conversationId),
      ),
    )
}

/**
 * Writes one chat-list page into SQLite. Profiles are written first and in the
 * same transaction, so a conversation never renders without its peer.
 *
 * Replace mode (default, page one) also prunes conversations missing from the
 * page so deleted chats do not linger offline. Append mode keeps existing rows
 * and continues their `position` sequence, so older pages slot in below the
 * first page.
 */
export async function cacheChatPage(
  db: Database,
  ownerUserId: string,
  page: UserMemberConversation[],
  peerProfiles: ConversationUserProfileWithStatus[],
  options: { append?: boolean } = {},
): Promise<void> {
  const { append = false } = options

  db.transaction((tx) => {
    for (const profile of peerProfiles) {
      const row = profileRowFromApi(profile)
      tx.delete(profiles)
        .where(and(eq(profiles.username, row.username), ne(profiles.userId, row.userId)))
        .run()
      tx.insert(profiles)
        .values(row)
        .onConflictDoUpdate({ target: profiles.userId, set: row })
        .run()
    }

    let startPosition = 0
    if (append) {
      const rows = tx
        .select({ max: sql<number>`COALESCE(MAX(position), -1) + 1` })
        .from(conversations)
        .where(eq(conversations.ownerUserId, ownerUserId))
        .all()
      startPosition = rows[0]?.max ?? 0
    }

    if (!append) {
      const ids = page.map((conversation) => conversation.conversationId)
      if (ids.length === 0) {
        tx.delete(conversations).where(eq(conversations.ownerUserId, ownerUserId)).run()
        return
      }

      tx.delete(conversations)
        .where(
          and(
            eq(conversations.ownerUserId, ownerUserId),
            notInArray(conversations.conversationId, ids),
          ),
        )
        .run()
    }

    page.forEach((conversation, index) => {
      const row: ConversationRow = {
        ownerUserId,
        conversationId: conversation.conversationId,
        conversationType: conversation.conversationType,
        unreadCount: conversation.unreadCount,
        lastMessageId: conversation.lastMessageId ?? null,
        lastMessageAt: conversation.lastMessageAt ?? null,
        lastMessagePreview: conversation.lastMessagePreview ?? null,
        position: startPosition + index,
      }
      tx.insert(conversations)
        .values(row)
        .onConflictDoUpdate({
          target: [conversations.ownerUserId, conversations.conversationId],
          set: row,
        })
        .run()
    })
  })
}
