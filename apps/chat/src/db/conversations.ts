import type { UserMemberConversation } from "@repo/types/schema"
import { and, eq, ne, notInArray } from "drizzle-orm"
import type { PublicUserProfile } from "@/api/users.api"
import type { Database } from "./client"
import { profileRowFromApi } from "./profiles"
import { conversations, profiles, type ConversationRow } from "./schema"

/**
 * Replaces one user's cached chat-list page. Profiles are written first and in
 * the same transaction, so a conversation never renders without its peer.
 * Conversations missing from the page are removed so deleted chats do not
 * linger offline.
 */
export async function cacheChatPage(
  db: Database,
  ownerUserId: string,
  page: UserMemberConversation[],
  peerProfiles: PublicUserProfile[],
): Promise<void> {
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

    page.forEach((conversation, position) => {
      const row: ConversationRow = {
        ownerUserId,
        conversationId: conversation.conversationId,
        conversationType: conversation.conversationType,
        unreadCount: conversation.unreadCount,
        position,
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
