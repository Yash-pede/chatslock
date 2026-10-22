import { router, useLocalSearchParams } from "expo-router";
import { ChevronDown, ChevronLeft, MoreVertical } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { EmptyState, Spinner, Text, TypingIndicator, useThemeColors } from "@repo/ui";
import { conversationsApi, type Message } from "@/api/conversations.api";
import { useMessagesApi } from "@/api/messages.api";
import { appendCachedMessage, cacheMessages, cacheRemove, getCachedMessages } from "@/lib/db/cache";
import { toChatMessage } from "@/components/messages/mappers";
import { MessageBubble } from "@/components/messages/message-bubble";
import { MessageComposer } from "@/components/messages/message-composer";
import type { ChatMessage } from "@/components/messages/types";
import { useAuth } from "@/context/AuthContext";
import { UserAvatar } from "@/components/user-avatar";

/** Distance from the bottom (px) beyond which the jump-to-latest button appears. */
const JUMP_THRESHOLD = 120;

/** Greeting emoji pool for empty conversations, Telegram-style. */
const EMPTY_EMOJIS = ["👋", "😊", "🐼", "🦊", "🌟", "🚀", "🍀", "🌈", "🐧", "🎈", "☕", "💡"];

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 12, paddingBottom: 12 },
  row: { paddingVertical: 3 },
});

const keyExtractor = (item: ChatMessage) => item.id;

/**
 * One conversation: header with the peer, the message list and the composer.
 * History comes from the SQLite cache first, then the messages API; sends and
 * realtime updates flow over the WebSocket.
 */
export default function ConversationScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; name?: string; avatar?: string }>();
  const {user} = useAuth();

  const name = params.name ?? "Conversation";
  const avatar = params.avatar;
  const conversationId = params.id ?? "";
  const currentUserId = user?.userId ?? null;

  const {api, onAck, onMessageCreated, onMessageUpdated, onMessageDeleted} = useMessagesApi();

  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** Mapped chat rows per conversation id; `null`/mismatched id means "still loading". */
  const [history, setHistory] = useState<{id: string; messages: ChatMessage[]; hasError: boolean} | null>(null);
  const optimisticSeq = useRef(0);

  /**
   * Appends/updates a mapped server message. A pending optimistic row with the
   * same text is replaced in place, so the bubble keeps its position in the
   * list and only its id/status change.
   */
  const upsertMessage = useCallback((message: Message) => {
    if (message.conversationId !== conversationId) return;
    const mapped = {...toChatMessage(message, currentUserId), status: "sent" as const};
    setHistory((current) => {
      if (current?.id !== conversationId) return current;

      const pendingIndex = current.messages.findIndex(
        (item) => item.isMine && item.status === "sending" && item.text === mapped.text,
      );
      if (pendingIndex !== -1) {
        const next = [...current.messages];
        next[pendingIndex] = mapped;
        return {...current, messages: next};
      }

      const existingIndex = current.messages.findIndex((item) => item.id === mapped.id);
      if (existingIndex !== -1) {
        const next = [...current.messages];
        next[existingIndex] = mapped;
        return {...current, messages: next};
      }

      return {...current, messages: [...current.messages, mapped]};
    });
  }, [conversationId, currentUserId]);

  const setMessageStatus = useCallback((id: string, status: ChatMessage["status"]) => {
    setHistory((current) => {
      if (current?.id !== conversationId) return current;
      return {
        ...current,
        messages: current.messages.map((item) => (item.id === id ? {...item, status} : item)),
      };
    });
  }, [conversationId]);

  const handleEmojiOpenChange = useCallback((open: boolean) => {
    // The composer owns dismissing the field; here we only release the keyboard
    // so the panel can occupy that space instead of stacking above it.
    if (open) Keyboard.dismiss();
    setEmojiOpen(open);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (!text || !conversationId || !currentUserId) return;

      const optimisticId = `optimistic-${Date.now()}-${optimisticSeq.current++}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        conversationId,
        senderId: currentUserId,
        isMine: true,
        kind: "text",
        text,
        createdAt: Date.now(),
        status: "sending",
      };

      // Optimistic: the row is in SQLite's place in line only — it is appended
      // to the visible list immediately and replaced by the server ack.
      setHistory((current) => {
        if (current?.id !== conversationId) return current;
        return {...current, messages: [...current.messages, optimistic]};
      });

      const accepted = api.send({conversationId, type: "TEXT", body: text});
      if (!accepted) setMessageStatus(optimisticId, "failed");
    },
    [api, conversationId, currentUserId, setMessageStatus],
  );

  const handleRetry = useCallback(
    (message: ChatMessage) => {
      setMessageStatus(message.id, "sending");
      const accepted = api.send({conversationId, type: "TEXT", body: message.text ?? ""});
      if (!accepted) setMessageStatus(message.id, "failed");
    },
    [api, conversationId, setMessageStatus],
  );

  // Paint the cached page instantly, then refresh from the API.
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    void getCachedMessages(conversationId).then((cached) => {
      if (!cancelled && cached.length > 0) {
        setHistory((current) =>
          current?.id === conversationId
            ? current
            : {id: conversationId, messages: cached.map((message) => toChatMessage(message, currentUserId)), hasError: false},
        );
      }
    });

    void (async () => {
      try {
        const {messages} = await conversationsApi.getMessages(conversationId);
        if (cancelled) return;
        setHistory({id: conversationId, messages: messages.map((message) => toChatMessage(message, currentUserId)), hasError: false});
        void cacheMessages(conversationId, messages);
      } catch {
        if (!cancelled) setHistory({id: conversationId, messages: [], hasError: true});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, currentUserId]);

  // Realtime updates: acks for our own actions, fan-out for the peer's.
  useEffect(() => {
    const offAck = onAck("message.sent", (ack) => {
      if (ack.type !== "message.sent") return;
      upsertMessage(ack.message);
      void appendCachedMessage(conversationId, ack.message);
    });

    const offError = onAck("error", (ack) => {
      if (ack.type !== "error" || ack.code !== "INTERNAL_ERROR") return;
      // A rejected frame (e.g. server hiccup) fails the newest pending send.
      setHistory((current) => {
        if (current?.id !== conversationId) return current;
        const index = current.messages.findLastIndex((item) => item.isMine && item.status === "sending");
        if (index === -1) return current;
        const next = [...current.messages];
        next[index] = {...next[index]!, status: "failed"};
        return {...current, messages: next};
      });
    });

    const offCreated = onMessageCreated((message) => {
      upsertMessage(message);
      void appendCachedMessage(conversationId, message);
    });

    const offUpdated = onMessageUpdated((message) => {
      upsertMessage(message);
      void cacheMessages(conversationId, [message]);
    });

    const offDeleted = onMessageDeleted((event) => {
      if (event.conversationId !== conversationId) return;
      setHistory((current) => {
        if (current?.id !== conversationId) return current;
        return {...current, messages: current.messages.filter((item) => item.id !== event.messageId)};
      });
      void cacheRemove("message", `${event.conversationId}:${event.messageId}`);
    });

    return () => {
      offAck();
      offError();
      offCreated();
      offUpdated();
      offDeleted();
    };
  }, [conversationId, onAck, onMessageCreated, onMessageUpdated, onMessageDeleted, upsertMessage]);

  const isLoading = history === null || history.id !== conversationId;
  const hasError = history?.hasError ?? false;

  // History rows are already mapped; newest first for the bottom-anchored list.
  const messages = useMemo(
    () => (history?.id === conversationId ? [...history.messages].reverse() : []),
    [history, conversationId],
  );

  // Deterministic per conversation so it stays put across re-renders.
  const emptyEmoji = useMemo(() => {
    let hash = 0;
    for (const character of conversationId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return EMPTY_EMOJIS[hash % EMPTY_EMOJIS.length];
  }, [conversationId]);

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
  const peerIsTyping = false;

  // Row wrappers (not the bubbles) own the vertical gap so FlashList measures
  // spacing as part of the cell and recycling stays stable.
  const renderItem = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <View style={styles.row}>
        <MessageBubble
          message={item}
          onRetry={item.status === "failed" ? () => handleRetry(item) : undefined}
        />
      </View>
    ),
    [handleRetry],
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
  );

  const loadingState = useMemo(
    () => (
      <View className="flex-1 items-center justify-center py-16">
        <Spinner size="lg" />
      </View>
    ),
    [],
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
          ListHeaderComponent={messages.length > 0 ? header : null}
          ListEmptyComponent={isLoading ? loadingState : hasError ? null : emptyState}
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
          onSend={handleSend}
          emojiOpen={emojiOpen}
          onEmojiOpenChange={handleEmojiOpenChange}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
