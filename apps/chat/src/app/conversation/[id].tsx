import { router, useFocusEffect, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown } from "lucide-react-native"
import { FlashList, type ListRenderItem } from "@shopify/flash-list"
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Text,
  useToast,
  useThemeColors,
} from "@repo/ui"
import * as Clipboard from "expo-clipboard"
import { and, eq } from "drizzle-orm"
import { useLiveQuery } from "drizzle-orm/expo-sqlite"
import { getPeerUserId, MESSAGE_ACTION_WINDOW_MS } from "@repo/types/schema"
import type { PeerUserStatus } from "@repo/types/req"
import { usersApi } from "@/api/users.api"
import {
  cacheProfiles,
  profileFromRow,
  starCachedConversation,
  starCachedMessage,
  unstarCachedConversation,
  unstarCachedMessage,
  useLocalDb,
} from "@/db"
import {
  conversations as conversationsTable,
  messages as messagesTable,
  profiles as profilesTable,
} from "@/db/schema"
import { useProfile } from "@/context/profile/ProfileContext"
import { useRealtime } from "@/context/RealtimeContext"
import {
  collectMedia,
  ConversationEmpty,
  ConversationHeader,
  ConversationListHeader,
  ConversationLoading,
  EditMessageDialog,
  MediaViewer,
  MessageActions,
  MessageBubble,
  MessageComposer,
  TypingBubble,
  useConversationMessages,
  useConversationMeta,
  useDocumentDownload,
  useMessageListScroll,
  usePeerPresence,
  type ChatMessage,
} from "@/components/messages"

const styles = StyleSheet.create({
  listContent: { paddingBottom: 12 },
  row: { paddingVertical: 3, paddingHorizontal: 12 },
})

/** Hard cap on multi-select so a forward request can never be unbounded. */
const MAX_MESSAGE_SELECTION = 50

// Prefer `pendingId`: it stays the same before and after the server ack, so a
// just-sent row is reused instead of remounted (which would jump the list and
// reload the image).
const keyExtractor = (item: ChatMessage) => item.pendingId ?? item.id

export default function ConversationScreen() {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { toast } = useToast()
  const { download } = useDocumentDownload()
  const params = useLocalSearchParams<{
    id: string
    name?: string
    avatar?: string
    unread?: string
  }>()
  const { user } = useProfile()

  const conversationId = params.id ?? ""
  const name = params.name ?? "Conversation"
  const avatar = params.avatar

  const {
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
  } = useConversationMessages(conversationId, user?.userId ?? null)

  const { listRef, awayFromBottom, onScroll, onScrollBeginDrag, scrollToBottom, onLoad } =
    useMessageListScroll<ChatMessage>({ onLoadOlder: loadOlder })

  // New messages should follow the newest row only while the user is already
  // at the bottom. Older-page inserts leave the last id unchanged, so they
  // never pull the viewport back down.
  const lastMessageId = messages.at(-1)?.id
  const lastMessageIdRef = useRef<string | undefined>(lastMessageId)
  useEffect(() => {
    const previous = lastMessageIdRef.current
    lastMessageIdRef.current = lastMessageId

    if (!lastMessageId || previous === undefined || previous === lastMessageId) return
    if (!awayFromBottom) scrollToBottom(true)
  }, [lastMessageId, awayFromBottom, scrollToBottom])

  // Follow the typing bubble only when the user is already at the bottom.
  useEffect(() => {
    if (peerTyping && !awayFromBottom) scrollToBottom(true)
  }, [peerTyping, awayFromBottom, scrollToBottom])

  const media = useMemo(() => collectMedia(messages), [messages])

  const mediaRef = useRef(media)
  useEffect(() => {
    mediaRef.current = media
  }, [media])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [peerPresence, setPeerPresence] = useState<{
    status: PeerUserStatus
    lastActiveAt: number
    username: string
  } | null>(null)
  const currentUserId = user?.userId ?? null
  const peerId = useMemo(
    () => (currentUserId ? getPeerUserId(conversationId, currentUserId) : null),
    [conversationId, currentUserId],
  )

  const { db } = useLocalDb()
  const { online } = useRealtime()
  const peerProfileQuery = useMemo(
    () =>
      db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, peerId ?? "")),
    [db, peerId],
  )
  const { data: peerProfileRows } = useLiveQuery(peerProfileQuery, [peerProfileQuery])
  const cachedPeer = useMemo(() => {
    const row = peerProfileRows.find((item) => item.userId === peerId)
    return row ? profileFromRow(row) : null
  }, [peerId, peerProfileRows])

  const starredQuery = useMemo(
    () =>
      db
        .select({ starred: conversationsTable.starred })
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.ownerUserId, currentUserId ?? ""),
            eq(conversationsTable.conversationId, conversationId),
          ),
        ),
    [conversationId, currentUserId, db],
  )
  const { data: starredRows } = useLiveQuery(starredQuery, [starredQuery])
  const isStarred = starredRows[0]?.starred ?? false

  const {
    status: livePeerStatus,
    lastActiveAt: livePeerLastActiveAt,
    statusRef: livePeerStatusRef,
    lastActiveAtRef: livePeerLastActiveAtRef,
  } = usePeerPresence(conversationId, currentUserId)
  useConversationMeta(conversationId, currentUserId)
  // Live presence wins; the cached profile keeps the header usable offline.
  const headerPeer = peerPresence ?? cachedPeer
  const peerStatus = livePeerStatus ?? peerPresence?.status ?? cachedPeer?.status
  const peerLastActiveAt = livePeerLastActiveAt ?? headerPeer?.lastActiveAt

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  /** When the selection started; the edit window is measured from here. */
  const [selectedAt, setSelectedAt] = useState<number | null>(null)
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null)

  const selectedCount = selectedIds.size
  const selectionActive = selectedCount > 0
  /** The single selected message; only meaningful when exactly one is picked. */
  const singleSelectedId = selectedCount === 1 ? [...selectedIds][0] : null
  const selectedMessage = singleSelectedId
    ? (messages.find((message) => message.id === singleSelectedId) ?? null)
    : null

  const selectedStarredQuery = useMemo(
    () =>
      db
        .select({ starred: messagesTable.starred })
        .from(messagesTable)
        .where(eq(messagesTable.messageId, singleSelectedId ?? "")),
    [db, singleSelectedId],
  )
  const { data: selectedStarredRows } = useLiveQuery(selectedStarredQuery, [selectedStarredQuery])
  const isMessageStarred = singleSelectedId ? (selectedStarredRows[0]?.starred ?? false) : false

  // Edits are only offered within the window the backend enforces. The
  // selection time is captured in an event handler, never during render.
  const canEdit = Boolean(
    selectedMessage &&
    selectedMessage.isMine &&
    !selectedMessage.isDeleted &&
    selectedMessage.type === "TEXT" &&
    !selectedMessage.isSystem &&
    selectedMessage.status !== "failed" &&
    selectedAt !== null &&
    selectedAt - selectedMessage.createdAt <= MESSAGE_ACTION_WINDOW_MS,
  )

  const mediaToDownload = useMemo(() => {
    if (!selectedMessage) return null

    // Prefer the original attachment URL (kept for images and audio too), then
    // fall back to the rendered media URL. Optimistic rows point at local files
    // (`file:`/`content:`), which cannot be downloaded until they are uploaded.
    const isRemote = (url: string | undefined): url is string =>
      Boolean(
        url &&
        !url.startsWith("file:") &&
        !url.startsWith("content:") &&
        !url.startsWith("blob:") &&
        !url.startsWith("data:"),
      )

    if (selectedMessage.attachment && isRemote(selectedMessage.attachment.url)) {
      return {
        url: selectedMessage.attachment.url,
        fileName: selectedMessage.attachment.fileName,
        mimeType: selectedMessage.attachment.mimeType,
      }
    }
    if (isRemote(selectedMessage.image?.url)) {
      return {
        url: selectedMessage.image.url,
        fileName: `photo-${selectedMessage.id}.jpg`,
        mimeType: "image/jpeg",
      }
    }
    if (isRemote(selectedMessage.video?.url)) {
      return {
        url: selectedMessage.video.url,
        fileName: `video-${selectedMessage.id}.mp4`,
        mimeType: "video/mp4",
      }
    }
    if (isRemote(selectedMessage.voice?.url)) {
      return {
        url: selectedMessage.voice.url,
        fileName: `voice-${selectedMessage.id}.m4a`,
        mimeType: "audio/mp4",
      }
    }
    return null
  }, [selectedMessage])

  const selectMessage = useCallback(
    (message: ChatMessage) => {
      // Tap or long-press toggles membership; long-press on the first message
      // opens the selection bar (edit window is measured from then).
      if (selectedIds.has(message.id)) {
        const next = new Set(selectedIds)
        next.delete(message.id)
        setSelectedIds(next)
        if (next.size === 0) setSelectedAt(null)
        return
      }

      if (selectedIds.size >= MAX_MESSAGE_SELECTION) {
        toast({
          title: "Limit reached",
          description: `You can select up to ${MAX_MESSAGE_SELECTION} messages.`,
        })
        return
      }

      if (selectedIds.size === 0) setSelectedAt(Date.now())
      setSelectedIds(new Set(selectedIds).add(message.id))
    },
    [selectedIds, toast],
  )

  const clearSelection = useCallback(() => {
    // Bail out with the same references when nothing is selected, so the
    // focus-time cleanup below never causes a pointless re-render.
    setSelectedIds((current) => (current.size > 0 ? new Set() : current))
    setSelectedAt((current) => (current !== null ? null : current))
  }, [])

  // Returning to this screen (e.g. from the forward picker) drops the
  // multi-selection so the header is shown instead of the actions bar.
  useFocusEffect(
    useCallback(() => {
      clearSelection()
    }, [clearSelection]),
  )

  const canCopy = Boolean(selectedMessage?.text?.trim())
  const canDownload = mediaToDownload !== null

  const copySelected = useCallback(() => {
    const text = selectedMessage?.text
    if (!text) return
    clearSelection()
    void Clipboard.setStringAsync(text)
      .then(() => toast({ title: "Copied", description: "Message copied to clipboard." }))
      .catch(() => toast({ title: "Could not copy", variant: "destructive" }))
  }, [clearSelection, selectedMessage, toast])

  const downloadSelected = useCallback(() => {
    if (!mediaToDownload) return
    clearSelection()
    void download(mediaToDownload).then((outcome) => {
      if (outcome === "saved") {
        toast({ title: "Downloaded", description: `${mediaToDownload.fileName} saved` })
      } else if (outcome === "error") {
        toast({ title: "Could not download", variant: "destructive" })
      }
    })
  }, [clearSelection, download, mediaToDownload, toast])

  const canDelete = Boolean(
    selectedMessage &&
    selectedMessage.isMine &&
    !selectedMessage.isDeleted &&
    !selectedMessage.isSystem &&
    selectedMessage.status !== "failed" &&
    selectedAt !== null &&
    selectedAt - selectedMessage.createdAt <= MESSAGE_ACTION_WINDOW_MS,
  )

  const toggleStar = useCallback(() => {
    if (!user?.userId) return
    const next = !isStarred
    void (
      next
        ? starCachedConversation(db, user.userId, conversationId)
        : unstarCachedConversation(db, user.userId, conversationId)
    ).catch(() => toast({ title: "Could not update chat", variant: "destructive" }))
  }, [conversationId, db, isStarred, toast, user])

  const toggleMessageStar = useCallback(() => {
    if (!selectedMessage) return
    clearSelection()
    const next = !isMessageStarred
    void (
      next ? starCachedMessage(db, selectedMessage.id) : unstarCachedMessage(db, selectedMessage.id)
    )
      .then(() => toast({ title: next ? "Message pinned" : "Message unpinned" }))
      .catch(() => toast({ title: "Could not update message", variant: "destructive" }))
  }, [clearSelection, db, isMessageStarred, selectedMessage, toast])

  const forwardSelected = useCallback(() => {
    router.push({
      pathname: "/forward",
      params: {
        ids: JSON.stringify([...selectedIds]),
      },
    })
  }, [selectedIds])

  // Presence + last activity for the header, refreshed when the screen gains focus.
  useFocusEffect(
    useCallback(() => {
      if (!peerId || !online) return
      let cancelled = false

      void usersApi
        .getProfiles([peerId])
        .then(([profile]) => {
          if (cancelled || !profile) return

          // A status event may have arrived while `/profiles` was in flight;
          // keep the live values instead of overwriting them with the snapshot.
          const nextStatus = livePeerStatusRef.current ?? profile.status
          const nextLastActiveAt = livePeerLastActiveAtRef.current ?? profile.lastActiveAt
          setPeerPresence({
            status: nextStatus,
            lastActiveAt: nextLastActiveAt,
            username: profile.username,
          })
          void cacheProfiles(db, [
            {
              ...profile,
              status: nextStatus,
              ...(livePeerLastActiveAtRef.current !== null
                ? { lastActiveAt: nextLastActiveAt }
                : {}),
            },
          ]).catch((error) => {
            console.warn("[db] failed to cache peer profile", error)
          })
        })
        .catch(() => undefined)

      return () => {
        cancelled = true
      }
    }, [db, livePeerLastActiveAtRef, livePeerStatusRef, online, peerId]),
  )

  const openMedia = useCallback((id: string) => {
    const index = mediaRef.current.findIndex((item) => item.id === id)
    if (index >= 0) setViewerIndex(index)
  }, [])

  const renderItem = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <View style={[styles.row, selectedIds.has(item.id) && { backgroundColor: colors.secondary }]}>
        <MessageBubble
          message={item}
          onPress={
            selectionActive && !item.isSystem && !item.isDeleted && item.status !== "failed"
              ? () => selectMessage(item)
              : undefined
          }
          onSelect={
            !item.isSystem && !item.isDeleted && item.status !== "failed"
              ? () => selectMessage(item)
              : undefined
          }
          onRetry={item.status === "failed" ? () => retry(item) : undefined}
          onOpenMedia={openMedia}
        />
      </View>
    ),
    [colors.secondary, openMedia, retry, selectMessage, selectedIds, selectionActive],
  )

  const emptyState =
    status === "loading" ? (
      <ConversationLoading />
    ) : status === "error" ? (
      <View className="items-center justify-center px-8 py-16">
        <Text variant="large" className="text-center">
          Couldn&apos;t load messages
        </Text>
        <Text variant="muted" className="mt-1 text-center">
          {online
            ? "Check your connection and try again."
            : "You're offline. Messages will load when you reconnect."}
        </Text>
      </View>
    ) : (
      <ConversationEmpty conversationId={conversationId} name={name} />
    )

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={!Keyboard.isVisible()}>
        <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
          {selectionActive ? (
            <MessageActions
              count={selectedCount}
              canCopy={canCopy}
              canDownload={canDownload}
              canEdit={canEdit}
              canDelete={canDelete}
              starred={isMessageStarred}
              onCopy={copySelected}
              onDownload={downloadSelected}
              onToggleStar={toggleMessageStar}
              onEdit={() => {
                setEditTarget(selectedMessage)
                clearSelection()
              }}
              onDelete={() => {
                setDeleteTarget(selectedMessage)
                clearSelection()
              }}
              onForward={forwardSelected}
              onCancel={clearSelection}
            />
          ) : (
            <ConversationHeader
              name={name}
              avatar={avatar}
              peerStatus={peerStatus}
              lastActiveAt={peerLastActiveAt}
              typing={peerTyping}
              onPressProfile={
                headerPeer
                  ? () => router.push(`/u/${encodeURIComponent(headerPeer.username)}`)
                  : undefined
              }
              starred={isStarred}
              onToggleStar={toggleStar}
              onViewStarred={() =>
                router.push({
                  pathname: "/conversation/starred",
                  params: { id: conversationId, name },
                })
              }
            />
          )}

          <FlashList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
            onLoad={onLoad}
            onScroll={onScroll}
            onScrollBeginDrag={onScrollBeginDrag}
            scrollEventThrottle={32}
            ListHeaderComponent={
              messages.length > 0 ? (
                <ConversationListHeader
                  name={name}
                  avatar={avatar}
                  hasOlder={hasOlder}
                  loadingOlder={loadingOlder}
                />
              ) : null
            }
            ListEmptyComponent={emptyState}
            ListFooterComponent={peerTyping ? <TypingBubble visible /> : null}
          />

          {awayFromBottom ? (
            <Pressable
              onPress={() => scrollToBottom(true)}
              accessibilityRole="button"
              accessibilityLabel="Jump to latest message"
              className="absolute bottom-24 end-4 h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-md active:opacity-80"
            >
              <ChevronDown size={20} color={colors.foreground} />
            </Pressable>
          ) : null}

          <MessageComposer
            onSend={send}
            onSendMedia={sendMedia}
            onSendAudio={sendAudio}
            onTyping={notifyTyping}
          />

          {editTarget ? (
            <EditMessageDialog
              key={editTarget.id}
              message={editTarget}
              onCancel={() => setEditTarget(null)}
              onSave={(text) => {
                editMessage(editTarget, text)
                setEditTarget(null)
              }}
            />
          ) : null}

          <AlertDialog
            open={deleteTarget !== null}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this message?</AlertDialogTitle>
                <AlertDialogDescription>
                  It will be removed for everyone in this chat.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onPress={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive"
                  onPress={() => {
                    if (deleteTarget) deleteMessage(deleteTarget)
                    setDeleteTarget(null)
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <MediaViewer
            items={media}
            initialIndex={viewerIndex ?? 0}
            visible={viewerIndex !== null}
            onClose={() => setViewerIndex(null)}
          />
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  )
}
