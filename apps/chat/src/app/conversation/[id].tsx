import { router, useLocalSearchParams } from "expo-router"
import { ChevronDown, ChevronLeft, MoreVertical } from "lucide-react-native"
import { useCallback, useMemo, useRef, useState } from "react"
import { FlashList, type FlashListRef, type ListRenderItem } from "@shopify/flash-list"
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { EmptyState, Spinner, Text, TypingIndicator, useThemeColors } from "@repo/ui"
import { useAuth } from "@/context/AuthContext"
import { MessageBubble } from "@/components/messages/message-bubble"
import { MessageComposer } from "@/components/messages/message-composer"
import type { ChatMessage } from "@/components/messages/types"
import { useConversationMessages } from "@/components/messages/use-conversation-messages"
import { UserAvatar } from "@/components/user-avatar"

/** Distance from the bottom (px) beyond which the jump-to-latest button appears. */
const JUMP_THRESHOLD = 120
/** Distance from the top (px) that triggers loading the next older page. */
const LOAD_OLDER_THRESHOLD = 200

/** Greeting emoji pool for empty conversations, Telegram-style. */
const EMPTY_EMOJIS = ["👋", "😊", "🐼", "🦊", "🌟", "🚀", "🍀", "🌈", "🐧", "🎈", "☕", "💡"]

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 12, paddingBottom: 12 },
  row: { paddingVertical: 3 },
})

const keyExtractor = (item: ChatMessage) => item.id

/**
 * One conversation: peer header, message list and composer. All message state
 * (cache, pagination, realtime, optimistic sends) lives in
 * `useConversationMessages`; this screen only renders it.
 */
export default function ConversationScreen() {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ id: string; name?: string; avatar?: string }>()
  const { user } = useAuth()

  const name = params.name ?? "Conversation"
  const avatar = params.avatar
  const conversationId = params.id ?? ""
  const currentUserId = user?.userId ?? null

  const { messages, status, hasOlder, loadingOlder, loadOlder, send, retry } =
    useConversationMessages(conversationId, currentUserId)

  const listRef = useRef<FlashListRef<ChatMessage>>(null)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)

  const handleEmojiOpenChange = useCallback((open: boolean) => {
    // The composer owns dismissing the field; here we only release the keyboard
    // so the panel can occupy that space instead of stacking above it.
    if (open) Keyboard.dismiss()
    setEmojiOpen(open)
  }, [])

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
      const shouldShow = distanceFromBottom > JUMP_THRESHOLD
      setShowJumpToLatest((current) => (current === shouldShow ? current : shouldShow))

      const distanceFromTop = contentOffset.y
      if (distanceFromTop < LOAD_OLDER_THRESHOLD) loadOlder()
    },
    [loadOlder],
  )

  const scrollToBottom = useCallback((animated: boolean) => {
    listRef.current?.scrollToEnd({ animated })
  }, [])

  const handleLoad = useCallback(() => {
    scrollToBottom(false)
  }, [scrollToBottom])

  const peerIsTyping = false

  const renderItem = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <View style={styles.row}>
        <MessageBubble
          message={item}
          onRetry={item.status === "failed" ? () => retry(item) : undefined}
        />
      </View>
    ),
    [retry],
  )

  const extraData = useMemo(
    () => `${messages.length}:${peerIsTyping}`,
    [messages.length, peerIsTyping],
  )

  const header = useMemo(() => {
    if (loadingOlder) {
      return (
        <View className="items-center py-3">
          <Spinner size="sm" />
        </View>
      )
    }
    if (hasOlder) return null
    return (
      <View className="items-center gap-2 pb-4 pt-6">
        <UserAvatar size={64} avatar={avatar} name={name} />
        <Text variant="large" className="text-center">
          {name}
        </Text>
        <Text variant="muted" className="text-center">
          This is the beginning of your conversation.
        </Text>
      </View>
    )
  }, [avatar, name, hasOlder, loadingOlder])

  const emptyEmoji = useMemo(() => {
    let hash = 0
    for (const character of conversationId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
    return EMPTY_EMOJIS[hash % EMPTY_EMOJIS.length]
  }, [conversationId])

  const emptyState = useMemo(
    () => (
      <EmptyState
        icon={<Text className="text-7xl">{emptyEmoji}</Text>}
        title={`Say hi to ${name}`}
        description="No messages here yet. Send a message or tap the greeting below."
        className="flex-1 self-center"
      />
    ),
    [emptyEmoji, name],
  )

  const loadingState = useMemo(
    () => (
      <View className="flex-1 items-center justify-center py-16">
        <Spinner size="lg" />
      </View>
    ),
    [],
  )

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to chats"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
        >
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>

        <UserAvatar size={38} avatar={avatar} name={name} />

        <View className="flex-1 ps-1">
          <Text variant="large" numberOfLines={1} className="text-base">
            {name}
          </Text>
          <Text variant="small" numberOfLines={1} className="font-normal text-muted-foreground">
            Direct message
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conversation options"
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
        >
          <MoreVertical size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <FlashList
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          extraData={extraData}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          // Newest message sits at the bottom: keep the viewport anchored there
          // as rows are appended or the keyboard resizes the list.
          maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.2 }}
          onLoad={handleLoad}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          ListHeaderComponent={messages.length > 0 ? header : null}
          ListEmptyComponent={
            status === "loading" ? loadingState : status === "error" ? null : emptyState
          }
          ListFooterComponent={
            peerIsTyping ? (
              <View style={styles.row}>
                <TypingIndicator />
              </View>
            ) : null
          }
        />

        {showJumpToLatest ? (
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
          emojiOpen={emojiOpen}
          onEmojiOpenChange={handleEmojiOpenChange}
        />
      </KeyboardAvoidingView>
    </View>
  )
}
