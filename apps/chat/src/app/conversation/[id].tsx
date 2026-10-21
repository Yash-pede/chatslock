import { router, useLocalSearchParams } from "expo-router";
import { ChevronDown, ChevronLeft, MoreVertical } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlashList,
  type FlashListRef,
  type ListRenderItem,
} from "@shopify/flash-list";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TypingIndicator, useThemeColors } from "@repo/ui";
import { DUMMY_MESSAGES } from "@/components/messages/dummy-messages";
import { MessageBubble } from "@/components/messages/message-bubble";
import { MessageComposer } from "@/components/messages/message-composer";
import type { ChatMessage } from "@/components/messages/types";
import { UserAvatar } from "@/components/user-avatar";

/** Distance from the bottom (px) beyond which the jump-to-latest button appears. */
const JUMP_THRESHOLD = 120;

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 12, paddingBottom: 12 },
  row: { paddingVertical: 3 },
});

const keyExtractor = (item: ChatMessage) => item.id;

/**
 * One conversation: header with the peer, the message list and the composer.
 * Messages currently come from local dummy data; history, sending and realtime
 * updates are added separately.
 */
export default function ConversationScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; name?: string; avatar?: string }>();

  const name = params.name ?? "Conversation";
  const avatar = params.avatar;

  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const handleEmojiOpenChange = useCallback((open: boolean) => {
    // The composer owns dismissing the field; here we only release the keyboard
    // so the panel can occupy that space instead of stacking above it.
    if (open) Keyboard.dismiss();
    setEmojiOpen(open);
  }, []);

  // Dummy data for now; the real page will arrive newest-last from the API.
  const messages = DUMMY_MESSAGES;

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const shouldShow = distanceFromBottom > JUMP_THRESHOLD;

      // Only re-render when the visibility actually flips.
      setShowJumpToLatest((current) => (current === shouldShow ? current : shouldShow));
    },
    [],
  );

  const scrollToBottom = useCallback((animated: boolean) => {
    listRef.current?.scrollToEnd({ animated });
  }, []);

  // FlashList renders its first batch asynchronously, so jump on onLoad rather
  // than on mount (calling too early is a no-op).
  const handleLoad = useCallback(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // Placeholder until presence/typing events arrive over the realtime channel.
  const peerIsTyping = true;

  // Row wrappers (not the bubbles) own the vertical gap so FlashList measures
  // spacing as part of the cell and recycling stays stable.
  const renderItem = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <View style={styles.row}>
        <MessageBubble message={item} />
      </View>
    ),
    [],
  );

  const extraData = useMemo(
    () => `${messages.length}:${peerIsTyping}`,
    [messages.length, peerIsTyping],
  );

  const header = useMemo(
    () => (
      <View className="items-center gap-2 pb-4 pt-6">
        <UserAvatar size={64} avatar={avatar} name={name} />
        <Text variant="large" className="text-center">
          {name}
        </Text>
        <Text variant="muted" className="text-center">
          This is the beginning of your conversation.
        </Text>
      </View>
    ),
    [avatar, name],
  );

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
          ListHeaderComponent={header}
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
          onSend={() => {}}
          emojiOpen={emojiOpen}
          onEmojiOpenChange={handleEmojiOpenChange}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
