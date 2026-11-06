import { useCallback, useEffect, useMemo, useState } from "react"
import { extractErrorMessage } from "@repo/utils"
import { conversationsApi, MAX_PROFILE_LOOKUP } from "@/api/conversations.api"
import {
  buildChatList,
  collectPeerIds,
  fetchPeerProfiles,
  type ChatListItem,
} from "@/components/chats/chat-list"

export interface UseChatListResult {
  items: ChatListItem[]
  /** True until the first fetch settles. */
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * The chats list: fetches the caller's conversations and resolves peer profiles.
 */
export function useChatList(currentUserId: string | null): UseChatListResult {
  const [items, setItems] = useState<ChatListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { conversations } = await conversationsApi.getChatPage({
        pageSize: MAX_PROFILE_LOOKUP,
      })
      const profiles = await fetchPeerProfiles(collectPeerIds(conversations, currentUserId))
      setItems(buildChatList(conversations, profiles, currentUserId))
      setError(null)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [currentUserId])

  // Fetches from an external system on mount (not a state sync), so the
  // deferred call is intentional; state lands in the promise callbacks.
  useEffect(() => {
    if (currentUserId === null) return
    void Promise.resolve().then(load)
  }, [currentUserId, load])

  return useMemo(() => ({ items, loading, error, refresh: load }), [items, loading, error, load])
}
