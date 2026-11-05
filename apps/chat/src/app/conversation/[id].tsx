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
import { useThemeColors } from "@repo/ui"
import { useProfile } from "@/context/profile/ProfileContext"
import {
  collectMedia,
  ConversationEmpty,
  ConversationHeader,
  ConversationListHeader,
  ConversationLoading,
  MediaViewer,
  MessageBubble,
  MessageComposer,
  useActiveConversation,
  useConversationMessages,
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

  useActiveConversation(conversationId)

  const { messages, status, hasOlder, loadingOlder, loadOlder, send, sendMedia, sendAudio, retry } =
    useConversationMessages(conversationId, user?.userId ?? null, {
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

  const media = useMemo(() => collectMedia(messages), [messages])

  const mediaRef = useRef(media)
  useEffect(() => {
    mediaRef.current = media
  }, [media])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const openMedia = useCallback((id: string) => {
    const index = mediaRef.current.findIndex((item) => item.id === id)
    if (index >= 0) setViewerIndex(index)
  }, [])

  const renderItem = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <View style={styles.row}>
        <MessageBubble
          message={item}
          onRetry={item.status === "failed" ? () => retry(item) : undefined}
          onOpenMedia={openMedia}
        />
      </View>
    ),
    [openMedia, retry],
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
          <ConversationHeader name={name} avatar={avatar} />

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

          <MessageComposer onSend={send} onSendMedia={sendMedia} onSendAudio={sendAudio} />

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
