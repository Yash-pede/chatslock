import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFocusEffect } from "expo-router"
import { asc, eq } from "drizzle-orm"
import { useLiveQuery } from "drizzle-orm/expo-sqlite"
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
import { useRealtime } from "@/context/RealtimeContext"
import {
  cacheMessages,
  cacheOptimisticMessage,
  cacheServerMessage,
  conversationPreview,
  failPendingMessage,
  findCachedMessage,
  markCachedMessageDeleted,
  removeCachedMessage,
  restoreCachedMessage,
  updateCachedConversationLastMessage,
  updateCachedMessageBody,
  useLocalDb,
} from "@/db"
import { messages as messagesTable, type CachedMessage } from "@/db/schema"
import { cachedRowToChatMessage } from "../lib/mappers"
import type { ChatMessage, PickedMedia } from "../types"
import type { RecordedAudio } from "./use-audio-recorder"

export type MessagesStatus = "loading" | "ready" | "error"

export interface UseConversationMessagesResult {
  messages: ChatMessage[]
  status: MessagesStatus
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder: () => void
  send: (text: string) => boolean
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

/**
 * Owns one conversation's messages. SQLite is the single source of truth:
 * history and realtime events are written to the cache, and `useLiveQuery`
 * re-renders the list from it. Outgoing messages are inserted as local
 * optimistic rows and replaced by the server row when its ack arrives.
 */
export function useConversationMessages(
  conversationId: string,
  currentUserId: string | null,
): UseConversationMessagesResult {
  const { api, subscribeToMessages } = useMessagesApi(conversationId, currentUserId)
  const { toast } = useToast()
  const { db } = useLocalDb()
  const { online, reconnectVersion } = useRealtime()

  const [fetchStatus, setFetchStatus] = useState<MessagesStatus>("loading")
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const cursorRef = useRef<string | undefined>(undefined)
  const loadingOlderRef = useRef(false)
  const activeRef = useRef(true)
  const handledReconnectRef = useRef(reconnectVersion)
  const [peerTyping, setPeerTyping] = useState(false)
  const typingSentRef = useRef(false)
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Edit/delete are optimistic; a missing broadcast rolls them back. */
  const pendingMutations = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; rollback: () => void }>(),
  )

  // The query is memoized so the live subscription is rebuilt only when the
  // conversation (or database instance) changes; table changes re-run it.
  const liveQuery = useMemo(
    () =>
      db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversationId))
        .orderBy(asc(messagesTable.messageId)),
    [conversationId, db],
  )
  const { data: rows, error: liveError } = useLiveQuery(liveQuery, [liveQuery])

  const messages = useMemo(
    () =>
      rows
        .filter((row) => row.conversationId === conversationId)
        .map((row) => cachedRowToChatMessage(row, currentUserId)),
    [rows, conversationId, currentUserId],
  )

  // Cached rows are enough to render, so they win over a pending/error fetch.
  const status: MessagesStatus =
    messages.length > 0 ? "ready" : !online ? "error" : liveError ? "error" : fetchStatus

  // Reset paging state during render when the conversation changes, so the
  // load effect never has to setState synchronously in its body.
  const [loadedConversationId, setLoadedConversationId] = useState(conversationId)
  if (loadedConversationId !== conversationId) {
    setLoadedConversationId(conversationId)
    setFetchStatus("loading")
    setHasOlder(false)
    setLoadingOlder(false)
  }

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
  const watchDelivery = useCallback(
    (clientId: string) => {
      setTimeout(() => {
        void failPendingMessage(db, clientId).catch((error) => {
          console.warn("[db] failed to mark message failed", error)
        })
      }, DELIVERY_TIMEOUT_MS)
    },
    [db],
  )

  /**
   * Persists a server message. `clientId` makes the sender's echo exact: the
   * optimistic row is removed in the same transaction as the server row insert.
   */
  const upsertServerMessage = useCallback(
    (message: Message, clientId?: string) => {
      if (message.conversationId !== conversationId) return
      settleMutation(message.messageId)
      void cacheServerMessage(db, message, clientId).catch((error) => {
        console.warn("[db] failed to cache message", error)
      })

      // Keep the home list's last-message preview/time in step with new and
      // edited messages without waiting for a chat-page refetch.
      if (currentUserId) {
        void updateCachedConversationLastMessage(db, {
          ownerUserId: currentUserId,
          conversationId: message.conversationId,
          lastMessageId: message.messageId,
          lastMessagePreview: conversationPreview(message),
          lastMessageAt: message.editedAt ?? message.createdAt,
        }).catch((error) => {
          console.warn("[db] failed to update conversation last message", error)
        })
      }
    },
    [conversationId, currentUserId, db, settleMutation],
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

  /** Initial history page from REST; the cache update drives the UI. */
  useEffect(() => {
    if (!conversationId) return

    let cancelled = false
    cursorRef.current = undefined
    loadingOlderRef.current = false

    void (async () => {
      try {
        const page = await fetchPage(undefined, PAGE_SIZE)
        if (cancelled) return
        await cacheMessages(db, page.messages)
        cursorRef.current = page.nextCursor
        setHasOlder(Boolean(page.nextCursor))
        setFetchStatus("ready")
      } catch {
        if (!cancelled) setFetchStatus("error")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [conversationId, db, fetchPage])

  /**
   * Realtime delivery is ephemeral: anything published while the socket was
   * down is gone. Re-fetching the newest page after the channel becomes ready
   * backfills those messages from durable storage. The cache/live query makes
   * the merge idempotent.
   */
  useEffect(() => {
    if (reconnectVersion === handledReconnectRef.current) return
    handledReconnectRef.current = reconnectVersion

    let cancelled = false
    void (async () => {
      try {
        const page = await fetchPage(undefined, PAGE_SIZE)
        if (cancelled || !activeRef.current) return

        await cacheMessages(db, page.messages)
        // Do not reset pagination if the user already paged back; only fill the
        // initial cursor if the first load never succeeded (offline launch).
        if (!cursorRef.current) {
          cursorRef.current = page.nextCursor
          setHasOlder(Boolean(page.nextCursor))
        }
        setFetchStatus("ready")
      } catch {
        // Cached rows remain; the next reconnect retries.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [db, fetchPage, reconnectVersion])

  const setTyping = useCallback(
    (next: TypingStatus) => {
      void api.typing(next).catch(() => undefined)
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

  // Focus-scoped so a conversation screen left in the stack (profile push,
  // another chat opened on top) does not keep a second channel listener.
  useFocusEffect(
    useCallback(
      () =>
        subscribeToMessages({
          onCreated: upsertServerMessage,
          onUpdated: upsertServerMessage,
          onDeleted: (event) => {
            if (event.conversationId !== conversationId) return
            settleMutation(event.messageId)
            void markCachedMessageDeleted(db, event.messageId).catch((error) => {
              console.warn("[db] failed to remove cached message", error)
            })

            // The deletion is the conversation's latest activity.
            if (currentUserId) {
              void updateCachedConversationLastMessage(db, {
                ownerUserId: currentUserId,
                conversationId: event.conversationId,
                lastMessageId: event.messageId,
                lastMessagePreview: "Message deleted",
                lastMessageAt: Date.now(),
              }).catch((error) => {
                console.warn("[db] failed to update conversation last message", error)
              })
            }
          },
          onTyping: handlePeerTyping,
        }),
      [
        currentUserId,
        db,
        conversationId,
        handlePeerTyping,
        settleMutation,
        subscribeToMessages,
        upsertServerMessage,
      ],
    ),
  )

  // Do not repopulate the cache after sign-out cleared it.
  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

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

  const loadOlder = useCallback(() => {
    // The ref guard makes repeated scroll events in the same frame harmless.
    if (loadingOlderRef.current || !hasOlder || !cursorRef.current) return

    loadingOlderRef.current = true
    setLoadingOlder(true)
    void fetchPage(cursorRef.current, PAGE_SIZE)
      .then(async (page) => {
        if (!activeRef.current) return
        await cacheMessages(db, page.messages)
        cursorRef.current = page.nextCursor
        setHasOlder(Boolean(page.nextCursor))
      })
      .catch(() => {
        // keep hasOlder so the next scroll retries
      })
      .finally(() => {
        loadingOlderRef.current = false
        setLoadingOlder(false)
      })
  }, [db, fetchPage, hasOlder])

  const send = useCallback(
    (text: string): boolean => {
      if (!text || !currentUserId) return false
      if (!online) {
        toast({
          title: "You're offline",
          description: "Connect to the internet to send messages.",
          variant: "destructive",
        })
        return false
      }

      const clientId = newClientId()
      const now = Date.now()
      const optimistic: Message = {
        messageId: `optimistic-${clientId}`,
        conversationId,
        senderId: currentUserId,
        type: "TEXT",
        body: text,
        createdAt: now,
      }
      stopTyping()

      void (async () => {
        try {
          await cacheOptimisticMessage(db, optimistic, clientId)
        } catch (error) {
          console.warn("[db] failed to cache outgoing message", error)
        }

        try {
          await api.send({ conversationId, type: "TEXT", body: text, clientId })
          watchDelivery(clientId)
        } catch {
          await failPendingMessage(db, clientId).catch((error) => {
            console.warn("[db] failed to mark message failed", error)
          })
        }
      })()

      return true
    },
    [api, conversationId, currentUserId, db, online, stopTyping, toast, watchDelivery],
  )

  /**
   * Sends a media message. A local row is written first so the picked file is
   * visible immediately, then the file is uploaded and the server ack replaces
   * it with the stored URL.
   */
  const sendMedia = useCallback(
    (media: PickedMedia) => {
      if (!media || !currentUserId) return
      if (!online) {
        toast({
          title: "You're offline",
          description: "Connect to the internet to send files.",
          variant: "destructive",
        })
        return
      }

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
      const clientId = newClientId()
      const now = Date.now()
      const optimistic: Message = {
        messageId: `optimistic-${clientId}`,
        conversationId,
        senderId: currentUserId,
        type: isImage ? "IMAGE" : "DOC",
        attachment: {
          url: media.uri,
          mimeType: contentType,
          sizeBytes,
          fileName: media.fileName,
        },
        createdAt: now,
      }

      void (async () => {
        try {
          await cacheOptimisticMessage(db, optimistic, clientId)
        } catch (error) {
          console.warn("[db] failed to cache outgoing media", error)
        }

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
          await failPendingMessage(db, clientId).catch(() => undefined)
        }
      })()
    },
    [api, conversationId, currentUserId, db, online, toast, watchDelivery],
  )

  /**
   * Sends a recorded voice note. The local row plays from the recorded file
   * immediately, then the upload replaces it with the stored URL.
   */
  const sendAudio = useCallback(
    (audio: RecordedAudio & { fileName: string; mimeType: string }) => {
      if (!audio?.uri || !currentUserId) return
      if (!online) {
        toast({
          title: "You're offline",
          description: "Connect to the internet to send voice messages.",
          variant: "destructive",
        })
        return
      }

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
      const now = Date.now()
      const optimistic: Message = {
        messageId: `optimistic-${clientId}`,
        conversationId,
        senderId: currentUserId,
        type: "AUDIO",
        attachment: {
          url: audio.uri,
          mimeType: contentType,
          sizeBytes,
          fileName: audio.fileName,
          durationMs: audio.durationMs,
        },
        createdAt: now,
      }

      void (async () => {
        try {
          await cacheOptimisticMessage(db, optimistic, clientId)
        } catch (error) {
          console.warn("[db] failed to cache outgoing audio", error)
        }

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
          await failPendingMessage(db, clientId).catch(() => undefined)
        }
      })()
    },
    [api, conversationId, currentUserId, db, online, toast, watchDelivery],
  )

  const retry = useCallback(
    (message: ChatMessage) => {
      // Only text can be retried: a failed media row needs a fresh upload, and
      // resending it as empty text would be rejected.
      const text = message.text
      if (message.type !== "TEXT" || !text) return
      if (!online) {
        toast({
          title: "You're offline",
          description: "Connect to the internet to send messages.",
          variant: "destructive",
        })
        return
      }

      const clientId = newClientId()
      const now = Date.now()
      const optimistic: Message = {
        messageId: `optimistic-${clientId}`,
        conversationId,
        senderId: message.senderId,
        type: "TEXT",
        body: text,
        createdAt: now,
      }

      void (async () => {
        await removeCachedMessage(db, message.id).catch((error) => {
          console.warn("[db] failed to replace failed message", error)
        })
        await cacheOptimisticMessage(db, optimistic, clientId).catch((error) => {
          console.warn("[db] failed to cache retried message", error)
        })

        try {
          await api.send({ conversationId, type: "TEXT", body: text, clientId })
          watchDelivery(clientId)
        } catch {
          await failPendingMessage(db, clientId).catch(() => undefined)
        }
      })()
    },
    [api, conversationId, db, online, toast, watchDelivery],
  )

  const editMessage = useCallback(
    (message: ChatMessage, body: string) => {
      const text = body.trim()
      if (!text || text === message.text || text.length > MAX_MESSAGE_LENGTH) return
      if (!online) {
        toast({
          title: "You're offline",
          description: "Connect to the internet to edit messages.",
          variant: "destructive",
        })
        return
      }
      if (Date.now() - message.createdAt > MESSAGE_ACTION_WINDOW_MS) {
        toast({
          title: "Edit window expired",
          description: "Messages can only be edited within 15 minutes of sending.",
          variant: "destructive",
        })
        return
      }

      const previous = message.text ?? null
      trackMutation(message.id, () => {
        void updateCachedMessageBody(db, message.id, previous).catch((error) => {
          console.warn("[db] failed to roll back message edit", error)
        })
      })

      void updateCachedMessageBody(db, message.id, text).catch((error) => {
        console.warn("[db] failed to edit message", error)
      })

      void api
        .edit({ conversationId, messageId: message.id, body: text, clientId: newClientId() })
        .catch(() => {
          if (!pendingMutations.current.has(message.id)) return
          settleMutation(message.id)
          void updateCachedMessageBody(db, message.id, previous).catch(() => undefined)
          toast({ title: "Could not edit the message", variant: "destructive" })
        })
    },
    [api, conversationId, db, online, settleMutation, toast, trackMutation],
  )

  const deleteMessage = useCallback(
    (message: ChatMessage) => {
      if (!online) {
        toast({
          title: "You're offline",
          description: "Connect to the internet to delete messages.",
          variant: "destructive",
        })
        return
      }
      if (Date.now() - message.createdAt > MESSAGE_ACTION_WINDOW_MS) {
        toast({
          title: "Delete window expired",
          description: "Messages can only be deleted within 15 minutes of sending.",
          variant: "destructive",
        })
        return
      }

      let snapshot: CachedMessage | undefined
      trackMutation(message.id, () => {
        if (!snapshot) return
        void restoreCachedMessage(db, snapshot).catch((error) => {
          console.warn("[db] failed to restore deleted message", error)
        })
      })

      void (async () => {
        try {
          snapshot = await findCachedMessage(db, message.id)
          if (!snapshot) {
            settleMutation(message.id)
            return
          }

          await markCachedMessageDeleted(db, message.id)
          await api.remove({
            conversationId,
            messageId: message.id,
            clientId: newClientId(),
          })
        } catch {
          if (!pendingMutations.current.has(message.id)) return
          settleMutation(message.id)
          if (snapshot) {
            await restoreCachedMessage(db, snapshot).catch((error) => {
              console.warn("[db] failed to restore deleted message", error)
            })
          }
          toast({ title: "Could not delete the message", variant: "destructive" })
        }
      })()
    },
    [api, conversationId, db, online, settleMutation, toast, trackMutation],
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
