import { useCallback, useEffect, useMemo, useState } from "react"
import type { Message } from "@repo/types/schema"
import { extractErrorMessage } from "@repo/utils"
import { conversationsApi, MAX_PROFILE_LOOKUP } from "@/api/conversations.api"
import { useMessagesApi } from "@/api/messages.api"
import {
  activityTime,
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
 * The chats list: fetches the caller's conversations, resolves peer profiles,
 * and joins them into rows sorted by last activity. Realtime message events
 * bump the affected row to the top of the already-loaded list.
 */
export function useChatList(currentUserId: string | null): UseChatListResult {
  const [items, setItems] = useState<ChatListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { onMessageCreated, onMessageUpdated } = useMessagesApi()

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

  /** Moves the conversation with the newest activity to its sorted position. */
  useEffect(() => {
    const bump = (message: Message) => {
      if (!message.conversationId || !message.createdAt) return
      setItems((current) => {
        const index = current.findIndex((item) => item.conversationId === message.conversationId)
        if (index === -1) return current
        const updated = { ...current[index]!, lastMessageAt: message.createdAt }
        const rest = current.filter((_, i) => i !== index)
        return [...rest, updated].sort((a, b) => activityTime(b) - activityTime(a))
      })
    }

    const offCreated = onMessageCreated(bump)
    const offUpdated = onMessageUpdated(bump)
    return () => {
      offCreated()
      offUpdated()
    }
  }, [onMessageCreated, onMessageUpdated])

  return useMemo(() => ({ items, loading, error, refresh: load }), [items, loading, error, load])
}
