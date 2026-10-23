import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Message, MessageAck } from "@repo/types/schema"
import { conversationsApi } from "@/api/conversations.api"
import { useMessagesApi } from "@/api/messages.api"
import {
  appendCachedMessage,
  cacheMessages,
  cacheRemove,
  getCachedConversation,
  getCachedMessages,
  patchCachedConversation,
} from "@/lib/db/cache"
import { toChatMessage } from "@/components/messages/mappers"
import type { ChatMessage } from "@/components/messages/types"

export type MessagesStatus = "loading" | "ready" | "error"

export interface UseConversationMessagesResult {
  messages: ChatMessage[]
  status: MessagesStatus
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder: () => void
  send: (text: string) => void
  retry: (message: ChatMessage) => void
}

const PAGE_SIZE = 25
const LIST_ACK_TIMEOUT_MS = 10_000

/** Deterministic sort so cache, pages and events land in one stable order. */
function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const item of [...existing, ...incoming]) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * Owns one conversation's messages: SQLite cache first for an instant paint,
 * the newest `PAGE_SIZE` from the WS `message.list` ack on top, cursor-based
 * paging (auto-continued until the unread backlog is fetched, then manual for
 * history), live WS events, and optimistic sends with retry.
 */
export function useConversationMessages(
  conversationId: string,
  currentUserId: string | null,
): UseConversationMessagesResult {
  const { api, onAck, onMessageCreated, onMessageUpdated, onMessageDeleted } = useMessagesApi()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<MessagesStatus>("loading")
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const cursorRef = useRef<string | undefined>(undefined)
  const unreadRemainingRef = useRef(0)
  const readSentRef = useRef(false)
  const seqRef = useRef(0)
  const pendingListRef = useRef<
    ((ack: Extract<MessageAck, { type: "message.list" }>) => void) | null
  >(null)

  const setMessageStatus = useCallback((id: string, next: ChatMessage["status"]) => {
    setMessages((current) =>
      current.map((item) => (item.id === id ? { ...item, status: next } : item)),
    )
  }, [])

  /** Replaces a pending optimistic row (same text) or upserts by id. */
  const upsertServerMessage = useCallback(
    (message: Message) => {
      if (message.conversationId !== conversationId) return
      const mapped = { ...toChatMessage(message, currentUserId), status: "sent" as const }
      setMessages((current) => {
        const pendingIndex = current.findIndex(
          (item) => item.isMine && item.status === "sending" && item.text === mapped.text,
        )
        if (pendingIndex !== -1) {
          const next = [...current]
          next[pendingIndex] = mapped
          return next
        }
        const existingIndex = current.findIndex((item) => item.id === mapped.id)
        if (existingIndex !== -1) {
          const next = [...current]
          next[existingIndex] = mapped
          return next
        }
        return [...current, mapped]
      })
    },
    [conversationId, currentUserId],
  )

  /** Waits for the WS `message.list` ack to the op this call sends. */
  const fetchPage = useCallback(
    (cursor: string | undefined, limit: number) =>
      new Promise<{ messages: Message[]; nextCursor?: string }>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingListRef.current = null
          reject(new Error("message.list timed out"))
        }, LIST_ACK_TIMEOUT_MS)
        pendingListRef.current = (ack) => {
          clearTimeout(timer)
          pendingListRef.current = null
          resolve({ messages: ack.messages, nextCursor: ack.nextCursor })
        }
        const accepted = api.list({ conversationId, ...(cursor ? { cursor } : {}), limit })
        if (!accepted) {
          clearTimeout(timer)
          pendingListRef.current = null
          reject(new Error("socket not open"))
        }
      }),
    [api, conversationId],
  )

  /** Merges a fetched page into state + SQLite; returns how many were new. */
  const applyPage = useCallback(
    (page: { messages: Message[] }) => {
      let received = 0
      setMessages((current) => {
        const known = new Set(current.map((item) => item.id))
        const fresh = page.messages.filter((message) => !known.has(message.messageId))
        received = fresh.filter((message) => message.senderId !== currentUserId).length
        const mapped = fresh.map((message) => toChatMessage(message, currentUserId))
        return mergeMessages(current, mapped)
      })
      unreadRemainingRef.current = Math.max(0, unreadRemainingRef.current - received)
      void cacheMessages(conversationId, page.messages)
    },
    [conversationId, currentUserId],
  )

  const markRead = useCallback(() => {
    if (readSentRef.current) return
    readSentRef.current = true
    unreadRemainingRef.current = 0
    api.read({ conversationId })
    void patchCachedConversation(conversationId, { unreadCount: 0 })
  }, [api, conversationId])

  /** Keeps loading pages until the unread backlog is fully fetched. */
  const fillUnread = useCallback(async () => {
    while (unreadRemainingRef.current > 0 && cursorRef.current) {
      const page = await fetchPage(cursorRef.current, PAGE_SIZE)
      cursorRef.current = page.nextCursor
      setHasOlder(Boolean(page.nextCursor))
      applyPage(page)
    }
    markRead()
  }, [applyPage, fetchPage, markRead])

  const loadOlder = useCallback(() => {
    if (loadingOlder || !hasOlder || !cursorRef.current) return
    setLoadingOlder(true)
    void fetchPage(cursorRef.current, PAGE_SIZE)
      .then((page) => {
        cursorRef.current = page.nextCursor
        setHasOlder(Boolean(page.nextCursor))
        applyPage(page)
      })
      .catch(() => {
        // keep hasOlder so the next scroll retries
      })
      .finally(() => setLoadingOlder(false))
  }, [applyPage, fetchPage, hasOlder, loadingOlder])

  useEffect(() => {
    if (!conversationId) return

    let cancelled = false
    cursorRef.current = undefined
    readSentRef.current = false
    unreadRemainingRef.current = 0

    void (async () => {
      const [cached, row] = await Promise.all([
        getCachedMessages(conversationId),
        getCachedConversation(conversationId),
      ])
      if (cancelled) return

      unreadRemainingRef.current = row?.unreadCount ?? 0

      if (cached.length > 0) {
        setMessages(cached.map((message) => toChatMessage(message, currentUserId)))
      }
      setStatus("loading")

      try {
        const page = await fetchPage(undefined, PAGE_SIZE)
        if (cancelled) return
        cursorRef.current = page.nextCursor
        setHasOlder(Boolean(page.nextCursor))
        applyPage(page)
        setStatus("ready")
        await fillUnread()
      } catch {
        // WS unavailable — fall back to the REST history endpoint once.
        try {
          const rest = await conversationsApi.getMessages(conversationId)
          if (cancelled) return
          applyPage({ messages: rest.messages })
          setStatus("ready")
          markRead()
        } catch {
          if (!cancelled) setStatus(cached.length > 0 ? "ready" : "error")
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // fetchPage/fillUnread/applyPage are stable per conversationId/api identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId])

  // Realtime: acks for own actions, fan-out for the peer's.
  useEffect(() => {
    const offAck = onAck("message.sent", (ack) => {
      if (ack.type !== "message.sent") return
      upsertServerMessage(ack.message)
      void appendCachedMessage(conversationId, ack.message)
    })

    const offError = onAck("error", (ack) => {
      if (ack.type !== "error" || ack.code !== "INTERNAL_ERROR") return
      setMessages((current) => {
        const index = current.findLastIndex((item) => item.isMine && item.status === "sending")
        if (index === -1) return current
        const next = [...current]
        next[index] = { ...next[index]!, status: "failed" }
        return next
      })
    })

    const offCreated = onMessageCreated((message) => {
      upsertServerMessage(message)
      void appendCachedMessage(conversationId, message)
    })

    const offUpdated = onMessageUpdated((message) => {
      upsertServerMessage(message)
      void cacheMessages(conversationId, [message])
    })

    const offDeleted = onMessageDeleted((event) => {
      if (event.conversationId !== conversationId) return
      setMessages((current) => current.filter((item) => item.id !== event.messageId))
      void cacheRemove("message", `${event.conversationId}:${event.messageId}`)
    })

    return () => {
      offAck()
      offError()
      offCreated()
      offUpdated()
      offDeleted()
    }
  }, [
    conversationId,
    onAck,
    onMessageCreated,
    onMessageUpdated,
    onMessageDeleted,
    upsertServerMessage,
  ])

  const send = useCallback(
    (text: string) => {
      if (!text || !currentUserId) return
      const optimisticId = `optimistic-${Date.now()}-${seqRef.current++}`
      const optimistic: ChatMessage = {
        id: optimisticId,
        conversationId,
        senderId: currentUserId,
        isMine: true,
        kind: "text",
        text,
        createdAt: Date.now(),
        status: "sending",
      }
      setMessages((current) => [...current, optimistic])

      const accepted = api.send({ conversationId, type: "TEXT", body: text })
      if (!accepted) setMessageStatus(optimisticId, "failed")
    },
    [api, conversationId, currentUserId, setMessageStatus],
  )

  const retry = useCallback(
    (message: ChatMessage) => {
      setMessageStatus(message.id, "sending")
      const accepted = api.send({ conversationId, type: "TEXT", body: message.text ?? "" })
      if (!accepted) setMessageStatus(message.id, "failed")
    },
    [api, conversationId, setMessageStatus],
  )

  return useMemo(
    () => ({ messages, status, hasOlder, loadingOlder, loadOlder, send, retry }),
    [messages, status, hasOlder, loadingOlder, loadOlder, send, retry],
  )
}
