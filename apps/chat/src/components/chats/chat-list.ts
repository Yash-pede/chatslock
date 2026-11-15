import { usersApi, type PublicUserProfile } from "@/api/users.api"
import { MAX_PROFILE_LOOKUP } from "@repo/types/req"
import { getPeerUserId, type UserMemberConversation } from "@repo/types/schema"

/** A conversation joined with the other participant's public profile. */
export interface ChatListItem {
  conversationId: string
  conversationType: UserMemberConversation["conversationType"]
  unreadCount: number
  peer: PublicUserProfile | null
}

/** Unique peer ids for a page, in first-seen order. */
export function collectPeerIds(
  conversations: UserMemberConversation[],
  currentUserId: string | null,
): string[] {
  const ids = new Set<string>()

  for (const conversation of conversations) {
    const peerId = getPeerUserId(conversation.conversationId, currentUserId)
    if (peerId) ids.add(peerId)
  }

  return [...ids]
}

/**
 * Resolves every peer profile through the users batch endpoint, chunking so a
 * page larger than the server limit still resolves completely.
 */
export async function fetchPeerProfiles(
  userIds: string[],
): Promise<Map<string, PublicUserProfile>> {
  const batches: string[][] = []
  for (let i = 0; i < userIds.length; i += MAX_PROFILE_LOOKUP) {
    batches.push(userIds.slice(i, i + MAX_PROFILE_LOOKUP))
  }

  const results = await Promise.all(batches.map((batch) => usersApi.getProfiles(batch)))
  const map = new Map<string, PublicUserProfile>()

  for (const profiles of results) {
    for (const profile of profiles) map.set(profile.userId, profile)
  }

  return map
}

export function buildChatList(
  conversations: UserMemberConversation[],
  profiles: Map<string, PublicUserProfile>,
  currentUserId: string | null,
): ChatListItem[] {
  return conversations.map<ChatListItem>((conversation) => {
    const peerId = getPeerUserId(conversation.conversationId, currentUserId)

    return {
      conversationId: conversation.conversationId,
      conversationType: conversation.conversationType,
      unreadCount: conversation.unreadCount,
      peer: peerId ? (profiles.get(peerId) ?? null) : null,
    }
  })
}

/** The chats screen filter. */
export type ChatFilter = "all" | "unread"

/** Counts shown on the filter tabs. */
export const countChats = (items: ChatListItem[]): Record<ChatFilter, number> => ({
  all: items.length,
  unread: items.filter((item) => item.unreadCount > 0).length,
})

/** The single section the active filter shows. */
export function sectionsFor(items: ChatListItem[], filter: ChatFilter) {
  if (filter === "unread")
    return [{ title: "Unread", data: items.filter((i) => i.unreadCount > 0) }]
  return [{ title: "All chats", data: items }]
}
