import { useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";
import {
  AppHeader,
  ConversationRow,
  Fab,
  IconButton,
  Screen,
  Text,
  radius,
  sizing,
  spacing,
  useTheme,
} from "@repo/ui";
import { takePendingChatId } from "@/utils/pendingChat";

type Conversation = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unreadCount?: number;
  mention?: boolean;
  muted?: boolean;
  verified?: boolean;
  read?: boolean;
};

/**
 * Placeholder rows until the conversations API is wired to this screen.
 * They exist so the list's layout, rhythm and states can be reviewed first.
 */
const CONVERSATIONS: Conversation[] = [
  {
    id: "design-crew",
    name: "Design Crew",
    preview: "Ana: I pushed the new tokens.",
    time: "09:42",
    unreadCount: 3,
    mention: true,
  },
  {
    id: "alex-morgan",
    name: "Alex Morgan",
    preview: "Sounds good, talk tomorrow.",
    time: "09:18",
    verified: true,
    read: true,
  },
  {
    id: "support",
    name: "chatslock Support",
    preview: "Your request has been resolved.",
    time: "Yesterday",
    verified: true,
  },
  {
    id: "priya-nair",
    name: "Priya Nair",
    preview: "Sent the invoice.",
    time: "Yesterday",
    muted: true,
  },
  {
    id: "product-updates",
    name: "Product Updates",
    preview: "What is new in chatslock this week.",
    time: "Mon",
    unreadCount: 12,
    verified: true,
  },
  {
    id: "sam-rivera",
    name: "Sam Rivera",
    preview: "Thanks, that helps.",
    time: "Sun",
    read: true,
  },
  {
    id: "weekend-plans",
    name: "Weekend Plans",
    preview: "Maya: I booked the table.",
    time: "Sat",
    unreadCount: 2,
  },
];

const comingSoon = (title: string) =>
  Alert.alert(title, "This screen is coming soon.");

export default function ChatsScreen() {
  const { colors } = useTheme();
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void takePendingChatId().then((chatId) => {
      if (!cancelled && chatId) {
        setPendingChatId(chatId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen
      testID="chats"
      scroll={false}
      padded={false}
      header={
        <AppHeader
          title="Chats"
          actions={
            <IconButton
              name="search"
              accessibilityLabel="Search chats"
              onPress={() => comingSoon("Search")}
            />
          }
        />
      }
    >
      {pendingChatId ? (
        <View
          style={[
            styles.banner,
            { backgroundColor: colors.accent, borderRadius: radius.md },
          ]}
        >
          <Text variant="caption" style={{ color: colors.accentForeground }}>
            Conversation {pendingChatId} will open here soon.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={CONVERSATIONS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationRow
            name={item.name}
            preview={item.preview}
            time={item.time}
            unreadCount={item.unreadCount}
            mention={item.mention}
            muted={item.muted}
            verified={item.verified}
            read={item.read}
            onPress={() => comingSoon(item.name)}
          />
        )}
        getItemLayout={(_, index) => ({
          length: sizing.rowHeight,
          offset: sizing.rowHeight * index,
          index,
        })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headline" tone="secondary">
              No conversations yet
            </Text>
            <Text variant="subhead" tone="tertiary">
              Start a chat and it will show up here.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        style={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <Fab
        accessibilityLabel="New chat"
        onPress={() => comingSoon("New chat")}
        style={styles.fab}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    padding: spacing.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl * 2,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.xxxl,
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
  },
});
