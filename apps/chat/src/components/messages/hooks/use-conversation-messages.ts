import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFocusEffect } from "expo-router"
import { and, eq, sql } from "drizzle-orm"
import { useLiveQuery } from "drizzle-orm/expo-sqlite"
import { File } from "expo-file-system"
import {
  getPeerUserId,
  MAX_MESSAGE_LENGTH,
  MESSAGE_ACTION_WINDOW_MS,
  type Message,
} from "@repo/types/schema"
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
import { playMessageFeedback, playMessageHaptic } from "@/lib/message-feedback"
import {
  cacheMessages,
  cacheOptimisticMessage,
  cacheServerMessage,
  conversationPreview,
  failPendingMessage,
  findCachedMessage,
  markCachedMessageDeleted,
  removeCachedMessage,
  removeFailedMessages,
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
  /** True once a fetch proved no older messages exist on the server. */
  reachedStart: boolean
  loadingOlder: boolean
  /** Reveals the next older page from the local cache. */
  loadOlder: () => void
  send: (text: string, replyTo?: string) => boolean
  sendMedia: (media: PickedMedia, replyTo?: string) => void
  sendAudio: (
    audio: RecordedAudio & { fileName: string; mimeType: string },
    replyTo?: string,
  ) => void
  retry: (message: ChatMessage) => void
  peerTyping: boolean
  notifyTyping: () => void
  editMessage: (message: ChatMessage, body: string) => void
  deleteMessage: (message: ChatMessage) => void
}

const PAGE_SIZE = 50

const RENDER_STEP = 50

const DELIVERY_TIMEOUT_MS = 10_000

const RECENT_FETCH_WINDOW_MS = 3_000

const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

function mediaObjectUrl(origin: string, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/")
  return `${origin}/${encodedKey}`
}

async function removeLocalMediaFile(uri: string): Promise<void> {
  if (!uri.startsWith("file:")) return
  try {
    const file = new File(uri)
    if (file.exists) file.delete()
  } catch (error) {
    console.warn("[media] failed to delete local file", { uri, error })
  }
}

export function useConversationMessages(
  conversationId: string,
  currentUserId: string | null,
): UseConversationMessagesResult {
  const { api, subscribeToMessages } = useMessagesApi(conversationId, currentUserId)
  const { toast } = useToast()
  const { db } = useLocalDb()
  const { online, reconnectVersion } = useRealtime()

  const [fetchStatus, setFetchStatus] = useState<MessagesStatus>("loading")
  const [loadingOlder, setLoadingOlder] = useState(false)
  /** Number of newest messages rendered; grows as older pages are revealed. */
  const [visibleCount, setVisibleCount] = useState(RENDER_STEP)
  /** True once a partial/empty fetch page proves the true start is fully cached. */
  const [reachedStart, setReachedStart] = useState(false)

  const cursorRef = useRef<string | undefined>(undefined)
  const loadingOlderRef = useRef(false)
  /**
   * Oldest messageId of a partial page that proved the true start; the
   * `reachedStart` flip is deferred until that row is actually rendered so the
   * beginning-of-conversation header never flashes a frame ahead of the list.
   * `oldestId: null` marks an empty page (nothing to wait for).
   */
  const pendingStartRef = useRef<{ conversationId: string; oldestId: string | null } | undefined>(
    undefined,
  )
  const activeRef = useRef(true)
  const handledReconnectRef = useRef(reconnectVersion)
  /**
   * Latest API handle in a ref, so fetch effects keyed on `fetchPage` are not
   * re-run when the api object identity changes (for example when the profile
   * finishes loading and `currentUserId` flips from null). That change used to
   * trigger a duplicate initial page fetch.
   */
  const apiRef = useRef(api)
  useEffect(() => {
    apiRef.current = api
  }, [api])
  /** Timestamp of the last successful page fetch. */
  const lastFetchAtRef = useRef(0)
  const [peerTyping, setPeerTyping] = useState(false)
  const typingSentRef = useRef(false)
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Edit/delete are optimistic; a missing broadcast rolls them back. */
  const pendingMutations = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; rollback: () => void }>(),
  )
  const peerUserId = getPeerUserId(conversationId, currentUserId)!

  const { data: rows, error: liveError } = useLiveQuery(
    db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(
        sql`CASE WHEN ${messagesTable.messageId} GLOB '[0-9]*' THEN 0 ELSE 1 END DESC`,
        sql`CAST(${messagesTable.messageId} AS INTEGER) DESC`,
      )
      .limit(visibleCount),
    [conversationId, visibleCount],
  )

  const messages = useMemo(
    () =>
      [...rows]
        .reverse()
        .filter((row) => row.conversationId === conversationId)
        .map((row) => cachedRowToChatMessage(row, currentUserId)),
    [rows, conversationId, currentUserId],
  )

  // Offline is not an error state: cached rows still render, and an empty
  // cache falls through to the default empty screen instead of a failure.
  const status: MessagesStatus =
    messages.length > 0 || !online ? "ready" : liveError ? "error" : fetchStatus

  useFocusEffect(
    useCallback(() => {
      void removeFailedMessages(db, conversationId).catch((error) => {
        console.warn("[db] failed to prune failed messages", error)
      })
    }, [conversationId, db]),
  )

  const [loadedConversationId, setLoadedConversationId] = useState(conversationId)
  if (loadedConversationId !== conversationId) {
    setLoadedConversationId(conversationId)
    setFetchStatus("loading")
    setVisibleCount(RENDER_STEP)
    setReachedStart(false)
    setLoadingOlder(false)
  }

  useEffect(() => {
    const pending = pendingStartRef.current
    if (pending === undefined) return
    if (pending.conversationId !== conversationId) {
      pendingStartRef.current = undefined
      return
    }
    if (
      pending.oldestId === null ||
      messages.some((message) => message.messageId === pending.oldestId)
    ) {
      pendingStartRef.current = undefined
      setReachedStart(true)
    }
  }, [conversationId, messages])

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
        playMessageHaptic("error")
        void failPendingMessage(db, clientId).catch((error) => {
          console.warn("[db] failed to mark message failed", error)
        })
      }, DELIVERY_TIMEOUT_MS)
    },
    [db],
  )

  const upsertServerMessage = useCallback(
    (message: Message, clientId?: string) => {
      if (message.conversationId !== conversationId) return
      settleMutation(message.uid)
      void cacheServerMessage(db, message, clientId).catch((error) => {
        console.warn("[db] failed to cache message", error)
      })

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

  const fetchPage = useCallback(
    (cursor: string | undefined, limit: number) =>
      apiRef.current.list({
        conversationId,
        ...(cursor ? { cursor } : {}),
        limit,
      }),
    [conversationId],
  )

  useEffect(() => {
    if (!conversationId) return

    let cancelled = false
    cursorRef.current = undefined
    loadingOlderRef.current = false
    // Mark the attempt up front so the channel-ready reconnect bump that can
    // arrive while this fetch is in flight is absorbed by the reconnect effect
    // instead of firing a duplicate page-1 request.
    lastFetchAtRef.current = Date.now()

    void (async () => {
      try {
        const page = await fetchPage(undefined, PAGE_SIZE)
        if (cancelled) return
        lastFetchAtRef.current = Date.now()
        await cacheMessages(db, page.messages)
        cursorRef.current = page.nextCursor
        setReachedStart(!page.nextCursor)
        setFetchStatus("ready")
      } catch {
        if (!cancelled) setFetchStatus("error")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [conversationId, db, fetchPage])

  useEffect(() => {
    if (reconnectVersion === handledReconnectRef.current) return
    handledReconnectRef.current = reconnectVersion

    // The first channel-ready bump arrives right after the initial page fetch;
    // absorbing it keeps opening a conversation to a single request. A real
    // reconnect always happens later than this window.
    if (Date.now() - lastFetchAtRef.current < RECENT_FETCH_WINDOW_MS) return

    let cancelled = false
    void (async () => {
      try {
        const page = await fetchPage(undefined, PAGE_SIZE)
        if (cancelled || !activeRef.current) return

        lastFetchAtRef.current = Date.now()
        await cacheMessages(db, page.messages)
        if (!cursorRef.current) {
          cursorRef.current = page.nextCursor
        }
        setReachedStart(!page.nextCursor)
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
    }, 4_000)
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

  useFocusEffect(
    useCallback(
      () =>
        subscribeToMessages({
          onCreated: (message, clientId) => {
            if (currentUserId && message.senderId !== currentUserId) {
              playMessageFeedback("received")
            }
            upsertServerMessage(message, clientId)
          },
          onUpdated: upsertServerMessage,
          onDeleted: (event) => {
            if (event.conversationId !== conversationId) return
            settleMutation(event.uid)
            void markCachedMessageDeleted(db, event.uid).catch((error) => {
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

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  useEffect(() => {
    const pending = pendingMutations.current
    return () => {
      stopTyping()
      for (const mutation of pending.values()) clearTimeout(mutation.timer)
      pending.clear()
    }
  }, [stopTyping])

  const loadOlder = useCallback(() => {
    if (loadingOlderRef.current) return
    loadingOlderRef.current = true

    void (async () => {
      try {
        // Oldest rendered row; optimistic rows are non-numeric and sort last,
        // so the top of the ascending list is a numeric sequence id.
        const top = messages.find((message) => /^\d+$/.test(message.messageId))
        const lowestId = top ? Number(top.messageId) : NaN
        if (!Number.isFinite(lowestId)) return

        // 1. Next RENDER_STEP older cached ids, newest first. Non-numeric rows
        // are excluded: their CAST would otherwise collapse them to 0.
        let contiguous = false
        try {
          const olderRows = await db
            .select({ messageId: messagesTable.messageId })
            .from(messagesTable)
            .where(
              and(
                eq(messagesTable.conversationId, conversationId),
                sql`${messagesTable.messageId} GLOB '[0-9]*'`,
                sql`CAST(${messagesTable.messageId} AS INTEGER) < ${lowestId}`,
              ),
            )
            .orderBy(sql`CAST(${messagesTable.messageId} AS INTEGER) DESC`)
            .limit(RENDER_STEP)

          const olderIds = olderRows.map((row) => Number(row.messageId))
          contiguous =
            olderIds.length === RENDER_STEP &&
            olderIds.every((id, index) => id === lowestId - 1 - index)
        } catch (error) {
          console.warn("[db] failed to check older messages", error)
        }

        // 2. Contiguous cache — or the true start already reached, in which
        // case the remaining holes are server-side gaps: reveal locally.
        if (contiguous || reachedStart) {
          setVisibleCount((count) => count + RENDER_STEP)
          return
        }

        // 3. Gap or cache boundary: fetch the page strictly older than the
        // oldest rendered message, cache it, and reveal the next step.
        setLoadingOlder(true)
        try {
          const page = await fetchPage(String(lowestId), PAGE_SIZE)
          if (!activeRef.current) return
          lastFetchAtRef.current = Date.now()
          await cacheMessages(db, page.messages)
          if (!page.nextCursor) {
            // Defer the flip: wait until the fetched rows have rendered.
            pendingStartRef.current = {
              conversationId,
              oldestId: page.messages.at(-1)?.messageId ?? null,
            }
          }
          setVisibleCount((count) => count + RENDER_STEP)
        } catch {
          // Keep the current state so the next scroll retries the same page.
        } finally {
          setLoadingOlder(false)
        }
      } finally {
        loadingOlderRef.current = false
      }
    })()
  }, [conversationId, db, fetchPage, messages, reachedStart])

  const send = useCallback(
    (text: string, replyTo?: string): boolean => {
      if (!text || !currentUserId) return false
      if (!online) {
        playMessageHaptic("warning")
        toast({
          title: "You're offline",
          description: "Connect to the internet to send messages.",
          variant: "destructive",
        })
        return false
      }

      playMessageFeedback("sent")
      const clientId = newClientId()
      const now = Date.now()
      const optimistic: Message = {
        uid: `optimistic-${clientId}`,
        messageId: `optimistic-${clientId}`,
        conversationId,
        senderId: currentUserId,
        type: "TEXT",
        body: text,
        createdAt: now,
        isForwarded: false,
        ...(replyTo ? { replyTo } : {}),
        peerId: peerUserId,
        version: 1,
      }
      stopTyping()

      void (async () => {
        try {
          await cacheOptimisticMessage(db, optimistic, clientId)
        } catch (error) {
          console.warn("[db] failed to cache outgoing message", error)
        }

        try {
          await api.send({
            conversationId,
            type: "TEXT",
            body: text,
            clientId,
            ...(replyTo ? { replyTo } : {}),
          })
          watchDelivery(clientId)
        } catch {
          playMessageHaptic("error")
          await failPendingMessage(db, clientId).catch((error) => {
            console.warn("[db] failed to mark message failed", error)
          })
        }
      })()

      return true
    },
    [api, conversationId, currentUserId, db, online, stopTyping, toast, watchDelivery, peerUserId],
  )

  const sendMedia = useCallback(
    (media: PickedMedia, replyTo?: string) => {
      if (!media || !currentUserId) return
      if (!online) {
        playMessageHaptic("warning")
        toast({
          title: "You're offline",
          description: "Connect to the internet to send files.",
          variant: "destructive",
        })
        return
      }

      playMessageFeedback("sent")
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
        uid: `optimistic-${clientId}`,
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
        peerId: peerUserId,
        isForwarded: false,
        ...(replyTo ? { replyTo } : {}),
        version: 1,
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
            ...(replyTo ? { replyTo } : {}),
          })
          await removeLocalMediaFile(media.uri)
          watchDelivery(clientId)
        } catch {
          playMessageHaptic("error")
          toast({ title: "Could not send the file", variant: "destructive" })
          await failPendingMessage(db, clientId).catch(() => undefined)
        }
      })()
    },
    [api, conversationId, currentUserId, db, online, toast, watchDelivery, peerUserId],
  )

  const sendAudio = useCallback(
    (audio: RecordedAudio & { fileName: string; mimeType: string }, replyTo?: string) => {
      if (!audio?.uri || !currentUserId) return
      if (!online) {
        playMessageHaptic("warning")
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
      playMessageFeedback("sent")
      const clientId = newClientId()
      const now = Date.now()
      const optimistic: Message = {
        uid: `optimistic-${clientId}`,
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
        peerId: peerUserId,
        isForwarded: false,
        ...(replyTo ? { replyTo } : {}),
        version: 1,
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
            ...(replyTo ? { replyTo } : {}),
          })
          await removeLocalMediaFile(audio.uri)
          watchDelivery(clientId)
        } catch {
          playMessageHaptic("error")
          toast({ title: "Could not send the audio", variant: "destructive" })
          await failPendingMessage(db, clientId).catch(() => undefined)
        }
      })()
    },
    [api, conversationId, currentUserId, db, online, toast, watchDelivery, peerUserId],
  )

  const retry = useCallback(
    (message: ChatMessage) => {
      const text = message.text
      if (message.type !== "TEXT" || !text) return
      if (!online) {
        playMessageHaptic("warning")
        toast({
          title: "You're offline",
          description: "Connect to the internet to send messages.",
          variant: "destructive",
        })
        return
      }

      playMessageFeedback("sent")
      const clientId = newClientId()
      const now = Date.now()
      const optimistic: Message = {
        uid: `optimistic-${clientId}`,
        messageId: `optimistic-${clientId}`,
        conversationId,
        senderId: message.senderId,
        type: "TEXT",
        body: text,
        createdAt: now,
        peerId: peerUserId,
        isForwarded: false,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        version: 1,
      }

      void (async () => {
        await removeCachedMessage(db, message.uid).catch((error) => {
          console.warn("[db] failed to replace failed message", error)
        })
        await cacheOptimisticMessage(db, optimistic, clientId).catch((error) => {
          console.warn("[db] failed to cache retried message", error)
        })

        try {
          await api.send({
            conversationId,
            type: "TEXT",
            body: text,
            clientId,
            ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          })
          watchDelivery(clientId)
        } catch {
          playMessageHaptic("error")
          await failPendingMessage(db, clientId).catch(() => undefined)
        }
      })()
    },
    [api, conversationId, db, online, toast, watchDelivery, peerUserId],
  )

  const editMessage = useCallback(
    (message: ChatMessage, body: string) => {
      const text = body.trim()
      if (!text || text === message.text || text.length > MAX_MESSAGE_LENGTH) return
      if (!online) {
        playMessageHaptic("warning")
        toast({
          title: "You're offline",
          description: "Connect to the internet to edit messages.",
          variant: "destructive",
        })
        return
      }
      if (Date.now() - message.createdAt > MESSAGE_ACTION_WINDOW_MS) {
        playMessageHaptic("warning")
        toast({
          title: "Edit window expired",
          description: "Messages can only be edited within 15 minutes of sending.",
          variant: "destructive",
        })
        return
      }

      const previous = message.text ?? null
      trackMutation(message.uid, () => {
        void updateCachedMessageBody(db, message.uid, previous).catch((error) => {
          console.warn("[db] failed to roll back message edit", error)
        })
      })

      void updateCachedMessageBody(db, message.uid, text).catch((error) => {
        console.warn("[db] failed to edit message", error)
      })

      void api
        .edit({ conversationId, uid: message.uid, body: text, clientId: newClientId() })
        .catch(() => {
          if (!pendingMutations.current.has(message.uid)) return
          playMessageHaptic("error")
          settleMutation(message.uid)
          void updateCachedMessageBody(db, message.uid, previous).catch(() => undefined)
          toast({ title: "Could not edit the message", variant: "destructive" })
        })
    },
    [api, conversationId, db, online, settleMutation, toast, trackMutation],
  )

  const deleteMessage = useCallback(
    (message: ChatMessage) => {
      if (!online) {
        playMessageHaptic("warning")
        toast({
          title: "You're offline",
          description: "Connect to the internet to delete messages.",
          variant: "destructive",
        })
        return
      }
      if (Date.now() - message.createdAt > MESSAGE_ACTION_WINDOW_MS) {
        playMessageHaptic("warning")
        toast({
          title: "Delete window expired",
          description: "Messages can only be deleted within 15 minutes of sending.",
          variant: "destructive",
        })
        return
      }

      let snapshot: CachedMessage | undefined
      trackMutation(message.uid, () => {
        if (!snapshot) return
        void restoreCachedMessage(db, snapshot).catch((error) => {
          console.warn("[db] failed to restore deleted message", error)
        })
      })

      void (async () => {
        try {
          snapshot = await findCachedMessage(db, message.uid)
          if (!snapshot) {
            settleMutation(message.uid)
            return
          }

          await markCachedMessageDeleted(db, message.uid)
          await api.remove({
            conversationId,
            uid: message.uid,
            clientId: newClientId(),
          })
        } catch {
          if (!pendingMutations.current.has(message.uid)) return
          playMessageHaptic("error")
          settleMutation(message.uid)
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
      reachedStart,
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
      reachedStart,
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
