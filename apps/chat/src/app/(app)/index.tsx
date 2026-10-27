import { useMemo, useState } from "react"
import { router } from "expo-router"
import { RefreshControl, SectionList, View } from "react-native"
import { Button, SafeArea, Spinner, Text, useThemeColors } from "@repo/ui"
import { useIdentity } from "@/context/AuthContext"
import { ComposeButton } from "@/components/chats/compose-button"
import { ConversationRow } from "@/components/chats/conversation-row"
import { ChatFilterTabs, ChatsTitleBar } from "@/components/chats/chats-header"
import {
  countChats,
  sectionsFor,
  type ChatFilter,
  type ChatListItem,
} from "@/components/chats/chat-list"
import { useChatList } from "@/components/chats/use-chat-list"

export default function ChatsScreen() {
  const colors = useThemeColors()
  const identity = useIdentity()
  const currentUserId = identity?.id ?? null

  const { items, loading, error, refresh } = useChatList(currentUserId)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<ChatFilter>("all")

  const counts = useMemo(() => countChats(items), [items])
  const sections = useMemo(() => sectionsFor(items, filter), [items, filter])

  const onRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  const openConversation = (item: ChatListItem) => {
    router.push({
      pathname: "/conversation/[id]",
      params: {
        id: item.conversationId,
        name: item.peer?.fullName ?? item.peer?.username ?? "Chat",
        ...(item.peer?.avatar ? { avatar: item.peer.avatar } : {}),
        // Lets the conversation page page in the unread backlog without refetching the list.
        ...(item.unreadCount > 0 ? { unread: String(item.unreadCount) } : {}),
      },
    })
  }

  return (
    <SafeArea edges={["top", "left", "right"]}>
      <View className="flex-1">
        <ChatsTitleBar unreadCount={counts.unread} total={counts.all} />
        <ChatFilterTabs filter={filter} counts={counts} onChange={setFilter} />

        {loading ? (
          <View className="flex-1 items-center justify-center gap-3 pb-20">
            <Spinner />
            <Text variant="muted">Loading conversations…</Text>
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center gap-4 px-8 pb-20">
            <Text variant="large" className="text-center">
              Couldn&apos;t load your chats
            </Text>
            <Text variant="muted" className="text-center">
              {error}
            </Text>
            <Button size="sm" onPress={() => void onRefresh()}>
              Try again
            </Button>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.conversationId}
            stickySectionHeadersEnabled={false}
            contentContainerClassName="pb-8"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                tintColor={colors.mutedForeground}
              />
            }
            renderItem={({ item }) => <ConversationRow item={item} onPress={openConversation} />}
            ListEmptyComponent={
              <View className="items-center justify-center px-8 py-16">
                <Text variant="large">
                  {filter === "all" ? "No conversations yet" : "Nothing here"}
                </Text>
                <Text variant="muted" className="mt-1 text-center">
                  {filter === "all"
                    ? "Start a chat and it will show up here."
                    : "Conversations matching this filter will appear here."}
                </Text>
              </View>
            }
            ListFooterComponent={
              filter === "all" && items.length > 0 ? (
                <Text
                  variant="small"
                  className="py-4 text-center font-normal text-muted-foreground"
                >
                  {items.length} conversations
                </Text>
              ) : undefined
            }
          />
        )}

        <ComposeButton />
      </View>
    </SafeArea>
  )
}
