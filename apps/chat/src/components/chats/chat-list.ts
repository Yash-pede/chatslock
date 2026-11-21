import type { CachedConversation } from "@/db/schema"
import type { ConversationUserProfileWithStatus } from "@repo/types/schema"

/** A cached conversation joined with its peer's public profile. */
export type ChatListItem = CachedConversation & {
  peer: ConversationUserProfileWithStatus | null
}

/** The chats screen filter. */
export type ChatFilter = "all" | "unread"

/** Counts shown on the filter tabs. */
export const countChats = (items: ChatListItem[]): Record<ChatFilter, number> => ({
  all: items.length,
  unread: items.filter((item) => item.unreadCount > 0).length,
})

/** Newest last-message activity first; conversations without one go last. */
const byLastMessageDesc = (a: ChatListItem, b: ChatListItem) =>
  (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)

/** The single section the active filter shows. */
export function sectionsFor(items: ChatListItem[], filter: ChatFilter) {
  if (filter === "unread") {
    const unread = items.filter((item) => item.unreadCount > 0).sort(byLastMessageDesc)
    return [{ title: "Unread", data: unread }]
  }
  return [{ title: "All chats", data: items }]
}
