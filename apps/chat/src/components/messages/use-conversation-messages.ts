import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Message } from "@repo/types/schema"
import { conversationsApi, responseStatus } from "@/api/conversations.api"
import { useMessagesApi } from "@/api/messages.api"
import { mergeMessages, toChatMessage } from "@/components/messages/mappers"
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

/** Unique per request; the server echoes it so replies stay correlated. */
const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export interface UseConversationMessagesOptions {
  /** Unread count from the chat list row; drives how much backlog to page in. */
  unreadCount?: number
}

/**
 * Owns one conversation's messages: the latest history page from the REST
 * endpoint, cursor-based paging for older history over the WS, live WS events,
 * and optimistic sends with retry.
 */
export function useConversationMessages(
  conversationId: string,
  currentUserId: string | null,
  { unreadCount = 0 }: UseConversationMessagesOptions = {},
): UseConversationMessagesResult {
  const { api, onMessageCreated, onMessageUpdated, onMessageDeleted } = useMessagesApi()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<MessagesStatus>("loading")
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const cursorRef = useRef<string | undefined>(undefined)
  const unreadRemainingRef = useRef(0)
  const readSentRef = useRef(false)

  // Reset to the loading state during render when the conversation changes, so
  // the load effect below never has to setState synchronously in its body.
  const [loadedConversationId, setLoadedConversationId] = useState(conversationId)
  if (loadedConversationId !== conversationId) {
    setLoadedConversationId(conversationId)
    setMessages([])
    setStatus("loading")
    setHasOlder(false)
    setLoadingOlder(false)
  }

  const setMessageStatus = useCallback((id: string, next: ChatMessage["status"]) => {
    setMessages((current) =>
      current.map((item) => (item.id === id ? { ...item, status: next } : item)),
    )
  }, [])

  /**
   * Replaces the optimistic row whose `clientId` the server echoed, otherwise
   * upserts by message id. `clientId` makes this exact even when the same text
   * is sent twice.
   */
  const upsertServerMessage = useCallback(
    (message: Message, clientId?: string) => {
      if (message.conversationId !== conversationId) return
      const mapped = { ...toChatMessage(message, currentUserId), status: "sent" as const }
      setMessages((current) => {
        const pendingIndex = current.findIndex((item) =>
          clientId ? item.pendingId === clientId : item.id === mapped.id,
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

  /** One page via the correlated `list` request; rejects on error/timeout. */
  const fetchPage = useCallback(
    (cursor: string | undefined, limit: number) =>
      api.list({
        conversationId,
        ...(cursor ? { cursor } : {}),
        limit,
      }),
    [api, conversationId],
  )

  /** Merges a fetched page into state; counts how many came from the peer. */
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
    },
    [currentUserId],
  )

  const markRead = useCallback(() => {
    if (readSentRef.current) return
    readSentRef.current = true
    unreadRemainingRef.current = 0
    // Fire-and-forget: failing to mark read must not affect the screen.
    void api.read({ conversationId }).catch(() => undefined)
  }, [api, conversationId])

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

  /**
   * The REST history endpoint is the primary load: it answers immediately, while
   * a WS `list` request only settles once the socket is open (it rejects
   * straight away while connecting, or waits for the ack once open).
   */
  useEffect(() => {
    if (!conversationId) return

    let cancelled = false
    cursorRef.current = undefined
    readSentRef.current = false
    unreadRemainingRef.current = unreadCount

    void (async () => {
      try {
        const rest = await conversationsApi.getMessages(conversationId)
        if (cancelled) return
        applyPage({ messages: rest.messages })
        setStatus("ready")
        markRead()
      } catch (error) {
        if (cancelled) return
        // 5xx/network: the socket may still reach the server, so try it once
        // before surfacing an error. 4xx is authoritative (e.g. not a member).
        const status = responseStatus(error)
        if (status !== undefined && status < 500) {
          setStatus("error")
          return
        }
        try {
          const page = await fetchPage(undefined, PAGE_SIZE)
          if (cancelled) return
          cursorRef.current = page.nextCursor
          setHasOlder(Boolean(page.nextCursor))
          applyPage(page)
          setStatus("ready")
          markRead()
        } catch {
          if (!cancelled) setStatus("error")
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // applyPage/markRead are stable per conversationId/api identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId])

  // Unsolicited events: the peer's new/edited/deleted messages.
  useEffect(() => {
    const offCreated = onMessageCreated(upsertServerMessage)
    const offUpdated = onMessageUpdated(upsertServerMessage)

    const offDeleted = onMessageDeleted((event) => {
      if (event.conversationId !== conversationId) return
      setMessages((current) => current.filter((item) => item.id !== event.messageId))
    })

    return () => {
      offCreated()
      offUpdated()
      offDeleted()
    }
  }, [conversationId, onMessageCreated, onMessageUpdated, onMessageDeleted, upsertServerMessage])

  const send = useCallback(
    (text: string) => {
      if (!text || !currentUserId) return

      const clientId = newClientId()
      const optimistic: ChatMessage = {
        id: `optimistic-${clientId}`,
        conversationId,
        senderId: currentUserId,
        isMine: true,
        kind: "text",
        text,
        createdAt: Date.now(),
        status: "sending",
        pendingId: clientId,
      }
      setMessages((current) => [...current, optimistic])

      // The server echoes this row's `clientId` on the ack, so the reply can
      // never be confused with another send.
      api
        .send({ conversationId, type: "TEXT", body: text, clientId })
        .then((message) => upsertServerMessage(message, clientId))
        .catch(() => setMessageStatus(optimistic.id, "failed"))
    },
    [api, conversationId, currentUserId, setMessageStatus, upsertServerMessage],
  )

  const retry = useCallback(
    (message: ChatMessage) => {
      const clientId = newClientId()
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, id: `optimistic-${clientId}`, pendingId: clientId, status: "sending" }
            : item,
        ),
      )

      api
        .send({ conversationId, type: "TEXT", body: message.text ?? "", clientId })
        .then((created) => upsertServerMessage(created, clientId))
        .catch(() => setMessageStatus(`optimistic-${clientId}`, "failed"))
    },
    [api, conversationId, setMessageStatus, upsertServerMessage],
  )

  return useMemo(
    () => ({ messages, status, hasOlder, loadingOlder, loadOlder, send, retry }),
    [messages, status, hasOlder, loadingOlder, loadOlder, send, retry],
  )
}
