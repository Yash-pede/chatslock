import { useLocalSearchParams } from "expo-router"
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
  useToast,
  useThemeColors,
} from "@repo/ui"
import * as Clipboard from "expo-clipboard"
import { MESSAGE_ACTION_WINDOW_MS } from "@repo/types/schema"
import { useProfile } from "@/context/profile/ProfileContext"
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
  useActiveConversation,
  useConversationMessages,
  useDocumentDownload,
  useMessageListScroll,
  type ChatMessage,
} from "@/components/messages"

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 12, paddingBottom: 12 },
  row: { paddingVertical: 3 },
})

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

  const { peerStatus } = useActiveConversation(conversationId, user?.userId ?? null)

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
  } = useConversationMessages(conversationId, user?.userId ?? null, {
    unreadCount: Number(params.unread) || 0,
  })

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** When the selection started; the edit window is measured from here. */
  const [selectedAt, setSelectedAt] = useState<number | null>(null)
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null)

  const selectedMessage = selectedId
    ? (messages.find((message) => message.id === selectedId) ?? null)
    : null

  // Edits are only offered within the window the backend enforces. The
  // selection time is captured in an event handler, never during render.
  const canEdit = Boolean(
    selectedMessage &&
    selectedMessage.isMine &&
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

  const canCopy = Boolean(selectedMessage?.text?.trim())
  const canDownload = mediaToDownload !== null

  const copySelected = useCallback(() => {
    const text = selectedMessage?.text
    if (!text) return
    void Clipboard.setStringAsync(text)
      .then(() => toast({ title: "Copied", description: "Message copied to clipboard." }))
      .catch(() => toast({ title: "Could not copy", variant: "destructive" }))
  }, [selectedMessage, toast])

  const downloadSelected = useCallback(() => {
    if (!mediaToDownload) return
    void download(mediaToDownload).then((outcome) => {
      if (outcome === "saved") {
        toast({ title: "Downloaded", description: `${mediaToDownload.fileName} saved` })
      } else if (outcome === "error") {
        toast({ title: "Could not download", variant: "destructive" })
      }
    })
  }, [download, mediaToDownload, toast])

  const canDelete = Boolean(
    selectedMessage &&
    selectedMessage.isMine &&
    !selectedMessage.isSystem &&
    selectedMessage.status !== "failed" &&
    selectedAt !== null &&
    selectedAt - selectedMessage.createdAt <= MESSAGE_ACTION_WINDOW_MS,
  )

  const selectMessage = useCallback((message: ChatMessage) => {
    // Copy/download are always available; edit/delete are gated separately.
    setSelectedId(message.id)
    setSelectedAt(Date.now())
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setSelectedAt(null)
  }, [])

  const openMedia = useCallback((id: string) => {
    const index = mediaRef.current.findIndex((item) => item.id === id)
    if (index >= 0) setViewerIndex(index)
  }, [])

  const renderItem = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <View style={styles.row}>
        <MessageBubble
          message={item}
          selected={item.id === selectedId}
          onSelect={
            !item.isSystem && item.status !== "failed" ? () => selectMessage(item) : undefined
          }
          onRetry={item.status === "failed" ? () => retry(item) : undefined}
          onOpenMedia={openMedia}
        />
      </View>
    ),
    [openMedia, retry, selectMessage, selectedId],
  )

  const emptyState =
    status === "loading" ? (
      <ConversationLoading />
    ) : status === "error" ? null : (
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
          <ConversationHeader
            name={name}
            avatar={avatar}
            peerStatus={peerStatus}
            typing={peerTyping}
          />

          {selectedMessage ? (
            <MessageActions
              canCopy={canCopy}
              canDownload={canDownload}
              canEdit={canEdit}
              canDelete={canDelete}
              onCopy={copySelected}
              onDownload={downloadSelected}
              onEdit={() => {
                setEditTarget(selectedMessage)
                clearSelection()
              }}
              onDelete={() => {
                setDeleteTarget(selectedMessage)
                clearSelection()
              }}
              onCancel={clearSelection}
            />
          ) : null}

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
