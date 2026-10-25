import { useCallback, useEffect, useMemo, useState } from "react"
import { router } from "expo-router"
import { Pressable, RefreshControl, ScrollView, SectionList, View } from "react-native"
import { Search } from "lucide-react-native"
import { Button, SafeArea, Spinner, Text, useThemeColors } from "@repo/ui"
import { extractErrorMessage } from "@repo/utils"
import { conversationsApi, MAX_PROFILE_LOOKUP } from "@/api/conversations.api"
import { useIdentity } from "@/context/AuthContext"
import { ComposeButton } from "@/components/chats/compose-button"
import { ConversationRow } from "@/components/chats/conversation-row"
import {
  buildChatList,
  collectPeerIds,
  fetchPeerProfiles,
  type ChatListItem,
} from "@/components/chats/chat-list"

type FilterKey = "all" | "unread" | "empty"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "empty", label: "Get started" },
]

/**
 * Telegram-like chats screen backed by `GET /api/conversations/chat`. Peer
 * profiles are resolved separately through `POST /api/conversations/profiles`
 * (ids extracted from the `u1#u2` conversation id), then joined and sorted by
 * last activity.
 */
export default function ChatsScreen() {
  const colors = useThemeColors()
  const identity = useIdentity()
  const currentUserId = identity?.id ?? null

  const [items, setItems] = useState<ChatListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>("all")

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const { conversations } = await conversationsApi.getChatPage({
          pageSize: MAX_PROFILE_LOOKUP,
        })
        const peerIds = collectPeerIds(conversations, currentUserId)
        const profiles = await fetchPeerProfiles(peerIds)
        if (signal.aborted) return
        setItems(buildChatList(conversations, profiles, currentUserId))
        setError(null)
      } catch (e) {
        if (signal.aborted) return
        setError(extractErrorMessage(e))
      } finally {
        if (!signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [currentUserId],
  )

  // Fetches from an external system in response to mount (not a state sync),
  // so the immediate call is intentional; state lands in the promise callbacks.
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => load(controller.signal))
    return () => controller.abort()
  }, [load])

  const refresh = () => {
    setRefreshing(true)
    void load(new AbortController().signal)
  }

  const openConversation = (item: ChatListItem) => {
    router.push({
      pathname: "/conversation/[id]",
      params: {
        id: item.conversationId,
        name: item.peer?.fullName ?? item.peer?.username ?? "Chat",
        ...(item.peer?.avatar ? { avatar: item.peer.avatar } : {}),
      },
    })
  }

  const counts = useMemo(
    () => ({
      all: items.length,
      unread: items.filter((item) => item.unreadCount > 0).length,
      empty: items.filter((item) => !item.lastMessageAt && !item.lastMessagePreview).length,
    }),
    [items],
  )

  const sections = useMemo(() => {
    if (filter === "unread") {
      return [{ title: "Unread", data: items.filter((item) => item.unreadCount > 0) }]
    }
    if (filter === "empty") {
      return [
        {
          title: "Get started",
          data: items.filter((item) => !item.lastMessageAt && !item.lastMessagePreview),
        },
      ]
    }
    return [{ title: "All chats", data: items }]
  }, [items, filter])

  return (
    <SafeArea edges={["top", "left", "right"]}>
      <View className="flex-1">
        <View className="flex-row items-center justify-between px-4 pb-1 pt-2">
          <Text className="text-[1.9rem] font-bold tracking-tight text-foreground">Chats</Text>
          <View className="flex-row items-center gap-4">
            <Text variant="small" className="text-muted-foreground">
              {counts.unread > 0 ? `${counts.unread} unread` : `${counts.all} chats`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search chats"
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full active:bg-secondary"
            >
              <Search size={21} color={colors.foreground} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-5 px-4 py-2"
          className="grow-0"
        >
          {FILTERS.map(({ key, label }) => {
            const active = filter === key

            return (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
                className="items-center gap-1.5 pb-1"
              >
                <View className="flex-row items-center gap-1.5">
                  <Text
                    className={`text-base ${active ? "font-semibold text-primary" : "font-medium text-muted-foreground"}`}
                  >
                    {label}
                  </Text>
                  {key !== "all" && counts[key] > 0 ? (
                    <View className="rounded-full bg-secondary px-1.5 py-0.5">
                      <Text className="text-[11px] font-semibold text-muted-foreground">
                        {counts[key]}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View
                  className={`h-[3px] w-8 rounded-full ${active ? "bg-primary" : "bg-transparent"}`}
                />
              </Pressable>
            )
          })}
        </ScrollView>

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
            <Button size="sm" onPress={() => void load(new AbortController().signal)}>
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
                onRefresh={refresh}
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
