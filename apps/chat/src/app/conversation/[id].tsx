import { useLocalSearchParams } from "expo-router"
import { useCallback } from "react"
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
import { MessageBubble } from "@/components/messages/message-bubble"
import { MessageComposer } from "@/components/messages/message-composer"
import { ConversationHeader } from "@/components/messages/conversation-header"
import {
  ConversationEmpty,
  ConversationListHeader,
  ConversationLoading,
} from "@/components/messages/conversation-list-states"
import type { ChatMessage } from "@/components/messages/types"
import { useConversationMessages } from "@/components/messages/use-conversation-messages"
import { useMessageListScroll } from "@/components/messages/use-message-list-scroll"

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 12, paddingBottom: 12 },
  row: { paddingVertical: 3 },
})

const keyExtractor = (item: ChatMessage) => item.id

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

  const { messages, status, hasOlder, loadingOlder, loadOlder, send, retry } =
    useConversationMessages(conversationId, user?.userId ?? null, {
      unreadCount: Number(params.unread) || 0,
    })

  const { listRef, awayFromBottom, onScroll, scrollToBottom, onLoad } =
    useMessageListScroll<ChatMessage>({ onLoadOlder: loadOlder })

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

  const emptyState =
    status === "loading" ? (
      <ConversationLoading />
    ) : status === "error" ? null : (
      <ConversationEmpty conversationId={conversationId} name={name} />
    )

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
            maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.2 }}
            onLoad={onLoad}
            onScroll={onScroll}
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

          <MessageComposer onSend={send} />
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  )
}
