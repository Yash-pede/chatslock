import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MAX_MESSAGE_LENGTH, MESSAGE_ACTION_WINDOW_MS, type Message } from "@repo/types/schema"
import {
  MAX_MEDIA_FILE_SIZE,
  normalizeMediaContentType,
  type MessageTypingData,
  type TypingStatus,
} from "@repo/types/req"
import { useToast } from "@repo/ui"
import { conversationsApi, uploadMediaToBucket } from "@/api/conversations.api"
import { useMessagesApi } from "@/api/messages.api"
import { mergeMessages, toChatMessage, waveformFrom } from "../lib/mappers"
import type { ChatMessage, PickedMedia } from "../types"
import type { RecordedAudio } from "./use-audio-recorder"

export type MessagesStatus = "loading" | "ready" | "error"

export interface UseConversationMessagesResult {
  messages: ChatMessage[]
  status: MessagesStatus
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder: () => void
  send: (text: string) => void
  sendMedia: (media: PickedMedia) => void
  sendAudio: (audio: RecordedAudio & { fileName: string; mimeType: string }) => void
  retry: (message: ChatMessage) => void
  /** The peer is typing on this conversation. */
  peerTyping: boolean
  /** Call on every non-empty composer change; throttles START/STOP for us. */
  notifyTyping: () => void
  /** Replaces the text of an existing message (own messages only). */
  editMessage: (message: ChatMessage, body: string) => void
  /** Removes a message (own messages only). */
  deleteMessage: (message: ChatMessage) => void
}

const PAGE_SIZE = 25

/**
 * AppSync resolves `channel.publish` even when the Lambda rejects the event
 * (the error is only listed in `publish_success.failed`), so a row that never
 * receives its broadcast is marked failed after this timeout.
 */
const DELIVERY_TIMEOUT_MS = 10_000

/** Unique per request; the server echoes it so replies stay correlated. */
const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * Builds the stored object URL from the bucket origin and the raw S3 key.
 * The key can contain characters that would break a URL (a DIRECT
 * conversation id looks like `DIRECT#u1#u2`, and `#` starts a fragment), so
 * each path segment is percent-encoded before it is stored as the message
 * attachment URL.
 */
function mediaObjectUrl(origin: string, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/")
  return `${origin}/${encodedKey}`
}

export interface UseConversationMessagesOptions {
  /** Unread count from the chat list row; drives how much backlog to page in. */
  unreadCount?: number
}

/**
 * Owns one conversation's messages: the latest history page and older pages
 * from the REST endpoint, live events from the AppSync conversation channel,
 * and optimistic sends with retry.
 */
export function useConversationMessages(
  conversationId: string,
  currentUserId: string | null,
  { unreadCount = 0 }: UseConversationMessagesOptions = {},
): UseConversationMessagesResult {
  const { api, subscribeToMessages } = useMessagesApi(conversationId, currentUserId)
  const { toast } = useToast()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<MessagesStatus>("loading")
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const cursorRef = useRef<string | undefined>(undefined)
  const loadingOlderRef = useRef(false)
  const unreadRemainingRef = useRef(0)
  const [peerTyping, setPeerTyping] = useState(false)
  const typingSentRef = useRef(false)
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Edit/delete are optimistic; a missing broadcast rolls them back. */
  const pendingMutations = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; rollback: () => void }>(),
  )

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

  const settleMutation = useCallback((id: string) => {
    const pending = pendingMutations.current.get(id)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingMutations.current.delete(id)
  }, [])

  const trackMutation = useCallback(
    (id: string, rollback: () => void) => {
      settleMutation(id)
      const timer = setTimeout(() => {
        pendingMutations.current.delete(id)
        rollback()
        toast({ title: "Could not update the message", variant: "destructive" })
      }, DELIVERY_TIMEOUT_MS)
      pendingMutations.current.set(id, { timer, rollback })
    },
    [settleMutation, toast],
  )

  /** Fails the optimistic row if its `clientId` never comes back from the channel. */
  const watchDelivery = useCallback((clientId: string) => {
    setTimeout(() => {
      setMessages((current) =>
        current.map((item) =>
          item.pendingId === clientId && item.status === "sending"
            ? { ...item, status: "failed" }
            : item,
        ),
      )
    }, DELIVERY_TIMEOUT_MS)
  }, [])

  /**
   * Replaces the optimistic row whose `clientId` the server echoed, otherwise
   * upserts by message id. `clientId` makes this exact even when the same text
   * is sent twice.
   */
  const upsertServerMessage = useCallback(
    (message: Message, clientId?: string) => {
      if (message.conversationId !== conversationId) return
      settleMutation(message.messageId)
      const mapped = { ...toChatMessage(message, currentUserId), status: "sent" as const }
      setMessages((current) => {
        const pendingIndex = current.findIndex((item) =>
          clientId ? item.pendingId === clientId : item.id === mapped.id,
        )
        if (pendingIndex !== -1) {
          const previous = current[pendingIndex]!
          const next = [...current]
          // Keep the optimistic row's `pendingId` so its React key stays stable
          // (FlashList reuses the row instead of remounting it) and keep the
          // already-visible local file until the user leaves the screen.
          next[pendingIndex] = {
            ...mapped,
            pendingId: previous.pendingId,
            image:
              previous.image && !previous.image.url.startsWith("http")
                ? previous.image
                : mapped.image,
            video:
              previous.video && !previous.video.url.startsWith("http")
                ? previous.video
                : mapped.video,
            voice:
              previous.voice && !previous.voice.url.startsWith("http")
                ? previous.voice
                : mapped.voice,
          }
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
    [conversationId, currentUserId, settleMutation],
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

  const setTyping = useCallback(
    (status: TypingStatus) => {
      void api.typing(status).catch(() => undefined)
    },
    [api],
  )

  /** START once, then a STOP after 2s without a keystroke. */
  const notifyTyping = useCallback(() => {
    if (!typingSentRef.current) {
      typingSentRef.current = true
      setTyping("START")
    }

    if (typingStopTimer.current) clearTimeout(typingStopTimer.current)
    typingStopTimer.current = setTimeout(() => {
      typingSentRef.current = false
      setTyping("STOP")
    }, 2_000)
  }, [setTyping])

  const stopTyping = useCallback(() => {
    if (typingStopTimer.current) {
      clearTimeout(typingStopTimer.current)
      typingStopTimer.current = null
    }
    if (typingSentRef.current) {
      typingSentRef.current = false
      setTyping("STOP")
    }
  }, [setTyping])

  /** Peer typing auto-clears in case the STOP frame is lost. */
  const handlePeerTyping = useCallback(
    (event: MessageTypingData) => {
      if (event.userId === currentUserId) return

      if (peerTypingTimer.current) {
        clearTimeout(peerTypingTimer.current)
        peerTypingTimer.current = null
      }

      if (event.status === "STOP") {
        setPeerTyping(false)
        return
      }

      setPeerTyping(true)
      peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 4_000)
    },
    [currentUserId],
  )

  const loadOlder = useCallback(() => {
    // The ref guard makes repeated scroll events in the same frame harmless.
    if (loadingOlderRef.current || !hasOlder || !cursorRef.current) return

    loadingOlderRef.current = true
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
      .finally(() => {
        loadingOlderRef.current = false
        setLoadingOlder(false)
      })
  }, [applyPage, fetchPage, hasOlder])

  /** Initial history page from REST; scroll-up pages use the same endpoint. */
  useEffect(() => {
    if (!conversationId) return

    let cancelled = false
    cursorRef.current = undefined
    loadingOlderRef.current = false
    unreadRemainingRef.current = unreadCount

    void (async () => {
      try {
        const page = await fetchPage(undefined, PAGE_SIZE)
        if (cancelled) return
        cursorRef.current = page.nextCursor
        setHasOlder(Boolean(page.nextCursor))
        applyPage(page)
        setStatus("ready")
      } catch {
        if (!cancelled) setStatus("error")
      }
    })()

    return () => {
      cancelled = true
    }
    // applyPage is stable per conversationId/api identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId])

  useEffect(
    () =>
      subscribeToMessages({
        onCreated: upsertServerMessage,
        onUpdated: upsertServerMessage,
        onDeleted: (event) => {
          if (event.conversationId !== conversationId) return
          settleMutation(event.messageId)
          setMessages((current) => current.filter((item) => item.id !== event.messageId))
        },
        onTyping: handlePeerTyping,
      }),
    [conversationId, handlePeerTyping, settleMutation, subscribeToMessages, upsertServerMessage],
  )

  // Leaving the screen must not leave the peer stuck on "typing…", and pending
  // edit/delete rollback timers must not fire after unmount.
  useEffect(() => {
    const pending = pendingMutations.current
    return () => {
      stopTyping()
      for (const mutation of pending.values()) clearTimeout(mutation.timer)
      pending.clear()
    }
  }, [stopTyping])

  const send = useCallback(
    (text: string) => {
      if (!text || !currentUserId) return

      const clientId = newClientId()
      const optimistic: ChatMessage = {
        id: `optimistic-${clientId}`,
        conversationId,
        senderId: currentUserId,
        isMine: true,
        type: "TEXT",
        text,
        createdAt: Date.now(),
        status: "sending",
        pendingId: clientId,
      }
      setMessages((current) => [...current, optimistic])
      stopTyping()

      // The broadcast echoes this row's `clientId`, so the event can never be
      // confused with another send; it replaces the optimistic row.
      void api
        .send({ conversationId, type: "TEXT", body: text, clientId })
        .then(() => watchDelivery(clientId))
        .catch(() => setMessageStatus(optimistic.id, "failed"))
    },
    [api, conversationId, currentUserId, setMessageStatus, stopTyping, watchDelivery],
  )

  /**
   * Sends a media message. The picked file is shown immediately (local uri for
   * images, so there is no blank bubble or layout jump), then uploaded to S3 and
   * sent over the conversation channel. Any failure marks the row as failed so it is not shown
   * as sent.
   */
  const sendMedia = useCallback(
    (media: PickedMedia) => {
      if (!media || !currentUserId) return

      // Pickers often report `application/octet-stream` or `image/jpg`; resolve
      // it from the extension so PDFs/documents/images all get a valid type.
      const contentType = normalizeMediaContentType(media.fileName, media.mimeType)
      if (!contentType) {
        toast({ title: "File type not supported", variant: "destructive" })
        return
      }
      if (media.sizeBytes > MAX_MEDIA_FILE_SIZE) {
        toast({ title: "File is too large (max 100 MB)", variant: "destructive" })
        return
      }

      const sizeBytes = Math.max(media.sizeBytes, 1)
      const isImage = contentType.startsWith("image/")
      const isVideo = contentType.startsWith("video/")
      const clientId = newClientId()
      const optimisticId = `optimistic-${clientId}`
      const dimensions = { width: media.width ?? 600, height: media.height ?? 600 }

      const optimistic: ChatMessage = {
        id: optimisticId,
        conversationId,
        senderId: currentUserId,
        isMine: true,
        type: isImage ? "IMAGE" : "DOC",
        // Show the picked file immediately: local uri + real dimensions, so the
        // bubble is sized right and previews without waiting for the upload.
        image: isImage ? { url: media.uri, ...dimensions } : undefined,
        video: isVideo ? { url: media.uri, ...dimensions } : undefined,
        attachment:
          isImage || isVideo
            ? undefined
            : {
                id: optimisticId,
                url: "",
                fileName: media.fileName,
                sizeBytes,
                mimeType: contentType,
              },
        createdAt: Date.now(),
        status: "sending",
        pendingId: clientId,
      }
      setMessages((current) => [...current, optimistic])

      void (async () => {
        try {
          const presign = await conversationsApi.getMediaPresign({
            contentType,
            fileName: media.fileName,
            fileSize: sizeBytes,
            conversationId,
          })

          await uploadMediaToBucket({
            uploadUrl: presign.uploadUrl,
            fields: presign.fields,
            file: { uri: media.uri, name: media.fileName, type: contentType },
          })

          const url = mediaObjectUrl(new URL(presign.uploadUrl).origin, presign.key)
          await api.send({
            conversationId,
            type: isImage ? "IMAGE" : "DOC",
            attachment: {
              url,
              mimeType: contentType,
              sizeBytes,
              fileName: media.fileName,
            },
            clientId,
          })
          watchDelivery(clientId)
        } catch {
          toast({ title: "Could not send the file", variant: "destructive" })
          setMessageStatus(optimisticId, "failed")
        }
      })()
    },
    [api, conversationId, currentUserId, setMessageStatus, toast, watchDelivery],
  )

  /**
   * Sends a recorded voice note. The row appears immediately with the local
   * file for instant playback, then uploads with a progress-free best-effort and
   * sends the `AUDIO` message (which requires `durationMs`).
   */
  const sendAudio = useCallback(
    (audio: RecordedAudio & { fileName: string; mimeType: string }) => {
      if (!audio?.uri || !currentUserId) return

      const contentType = normalizeMediaContentType(audio.fileName, audio.mimeType)
      if (!contentType) {
        toast({ title: "Could not send the audio", variant: "destructive" })
        return
      }
      if (audio.sizeBytes > MAX_MEDIA_FILE_SIZE) {
        toast({ title: "Recording is too large (max 100 MB)", variant: "destructive" })
        return
      }

      const sizeBytes = Math.max(audio.sizeBytes, 1)
      const clientId = newClientId()
      const optimisticId = `optimistic-${clientId}`
      const durationSeconds = Math.max(1, Math.round(audio.durationMs / 1000))

      const optimistic: ChatMessage = {
        id: optimisticId,
        conversationId,
        senderId: currentUserId,
        isMine: true,
        type: "AUDIO",
        voice: { url: audio.uri, durationSeconds, waveform: waveformFrom(clientId) },
        createdAt: Date.now(),
        status: "sending",
        pendingId: clientId,
      }
      setMessages((current) => [...current, optimistic])

      void (async () => {
        try {
          const presign = await conversationsApi.getMediaPresign({
            contentType,
            fileName: audio.fileName,
            fileSize: sizeBytes,
            conversationId,
          })

          await uploadMediaToBucket({
            uploadUrl: presign.uploadUrl,
            fields: presign.fields,
            file: { uri: audio.uri, name: audio.fileName, type: contentType },
          })

          const url = mediaObjectUrl(new URL(presign.uploadUrl).origin, presign.key)
          await api.send({
            conversationId,
            type: "AUDIO",
            attachment: {
              url,
              mimeType: contentType,
              sizeBytes,
              fileName: audio.fileName,
              durationMs: audio.durationMs,
            },
            clientId,
          })
          watchDelivery(clientId)
        } catch {
          toast({ title: "Could not send the audio", variant: "destructive" })
          setMessageStatus(optimisticId, "failed")
        }
      })()
    },
    [api, conversationId, currentUserId, setMessageStatus, toast, watchDelivery],
  )

  const retry = useCallback(
    (message: ChatMessage) => {
      // Only text can be retried: a failed media row needs a fresh upload, and
      // resending it as empty text would be rejected.
      if (message.type !== "TEXT" || !message.text) return

      const clientId = newClientId()
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, id: `optimistic-${clientId}`, pendingId: clientId, status: "sending" }
            : item,
        ),
      )

      void api
        .send({ conversationId, type: "TEXT", body: message.text ?? "", clientId })
        .then(() => watchDelivery(clientId))
        .catch(() => setMessageStatus(`optimistic-${clientId}`, "failed"))
    },
    [api, conversationId, setMessageStatus, watchDelivery],
  )

  const editMessage = useCallback(
    (message: ChatMessage, body: string) => {
      const text = body.trim()
      if (!text || text === message.text || text.length > MAX_MESSAGE_LENGTH) return
      if (Date.now() - message.createdAt > MESSAGE_ACTION_WINDOW_MS) {
        toast({
          title: "Edit window expired",
          description: "Messages can only be edited within 15 minutes of sending.",
          variant: "destructive",
        })
        return
      }

      const previous = message.text
      setMessages((current) =>
        current.map((item) => (item.id === message.id ? { ...item, text } : item)),
      )
      trackMutation(message.id, () =>
        setMessages((current) =>
          current.map((item) => (item.id === message.id ? { ...item, text: previous } : item)),
        ),
      )

      void api
        .edit({ conversationId, messageId: message.id, body: text, clientId: newClientId() })
        .catch(() => {
          settleMutation(message.id)
          setMessages((current) =>
            current.map((item) => (item.id === message.id ? { ...item, text: previous } : item)),
          )
          toast({ title: "Could not edit the message", variant: "destructive" })
        })
    },
    [api, conversationId, settleMutation, toast, trackMutation],
  )

  const deleteMessage = useCallback(
    (message: ChatMessage) => {
      if (Date.now() - message.createdAt > MESSAGE_ACTION_WINDOW_MS) {
        toast({
          title: "Delete window expired",
          description: "Messages can only be deleted within 15 minutes of sending.",
          variant: "destructive",
        })
        return
      }

      setMessages((current) => current.filter((item) => item.id !== message.id))
      trackMutation(message.id, () => setMessages((current) => mergeMessages(current, [message])))

      void api
        .remove({ conversationId, messageId: message.id, clientId: newClientId() })
        .catch(() => {
          settleMutation(message.id)
          setMessages((current) => mergeMessages(current, [message]))
          toast({ title: "Could not delete the message", variant: "destructive" })
        })
    },
    [api, conversationId, settleMutation, toast, trackMutation],
  )

  return useMemo(
    () => ({
      messages,
      status,
      hasOlder,
      loadingOlder,
      loadOlder,
      send,
      sendMedia,
      sendAudio,
      retry,
      peerTyping,
      notifyTyping,
      editMessage,
      deleteMessage,
    }),
    [
      messages,
      status,
      hasOlder,
      loadingOlder,
      loadOlder,
      send,
      sendMedia,
      sendAudio,
      retry,
      peerTyping,
      notifyTyping,
      editMessage,
      deleteMessage,
    ],
  )
}
