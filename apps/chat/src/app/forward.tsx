import { useCallback, useMemo, useRef, useState } from "react"
import { router, useLocalSearchParams } from "expo-router"
import { Check, ChevronLeft, Forward, Search } from "lucide-react-native"
import { FlashList, type ListRenderItem } from "@shopify/flash-list"
import { Pressable, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { desc, eq, inArray } from "drizzle-orm"
import { useLiveQuery } from "drizzle-orm/expo-sqlite"
import { Text, useThemeColors, useToast } from "@repo/ui"
import { getPeerUserId } from "@repo/types/schema"
import { MESSAGE_EVENT, type SendMessageData } from "@repo/types/req"
import { useLocalDb } from "@/db"
import { profileFromRow } from "@/db/profiles"
import {
  conversations as conversationsTable,
  messages as messagesTable,
  profiles as profilesTable,
  type CachedMessage,
} from "@/db/schema"
import { useProfile } from "@/context/profile/ProfileContext"
import { useRealtime } from "@/context/RealtimeContext"
import { conversationChannel } from "@/lib/realtime"
import { ConversationRow } from "@/components/chats/conversation-row"
import type { ChatListItem } from "@/components/chats/chat-list"

/** Maximum chats a batch of messages can be forwarded to at once. */
const MAX_FORWARD_CHATS = 5

/** Unique per publish; the server echoes it so replies stay correlated. */
const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * Rebuilds the publish payload from a cached row. Tombstones and rows whose
 * content was never persisted are skipped so the server schema (strict) never
 * rejects the forwarded message.
 */
function toSendData(row: CachedMessage): SendMessageData | null {
  const body = row.body && row.body.length > 0 ? row.body : null

  if (row.type === "TEXT") {
    if (!body) return null
    return { type: "TEXT", body, clientId: newClientId(), isForwarded: true }
  }

  if (!row.attachment) return null
  return { type: row.type, attachment: row.attachment, clientId: newClientId(), isForwarded: true }
}

/**
 * Forward picker: lists the signed-in user's cached conversations with a
 * selectable circle on the right, plus a local search over peer name/username.
 * The selected message ids arrive as a JSON `ids` param from the conversation.
 */
export default function ForwardScreen() {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { publish, online } = useRealtime()
  const { toast } = useToast()
  const { db } = useLocalDb()
  const { user } = useProfile()
  const params = useLocalSearchParams<{ ids?: string; conversationId?: string }>()

  const messageIds = useMemo(() => {
    try {
      const parsed: unknown = params.ids ? JSON.parse(params.ids) : []
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : []
    } catch {
      return []
    }
  }, [params.ids])

  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const forwardingRef = useRef(false)

  const currentUserId = user?.userId ?? null
  const ownerUserId = user?.userId ?? ""

  const conversationQuery = useMemo(
    () =>
      db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.ownerUserId, ownerUserId))
        .orderBy(desc(conversationsTable.lastMessageAt)),
    [db, ownerUserId],
  )
  const { data: conversationRows } = useLiveQuery(conversationQuery, [conversationQuery])

  const profileQuery = useMemo(() => db.select().from(profilesTable), [db])
  const { data: profileRows } = useLiveQuery(profileQuery, [profileQuery])

  const items = useMemo<ChatListItem[]>(() => {
    const byId = new Map(profileRows.map((row) => [row.userId, profileFromRow(row)]))
    return conversationRows
      .filter((row) => row.ownerUserId === ownerUserId)
      .map((row) => {
        const peerId = getPeerUserId(row.conversationId, currentUserId)
        return { ...row, peer: peerId ? (byId.get(peerId) ?? null) : null }
      })
  }, [conversationRows, currentUserId, ownerUserId, profileRows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.peer?.fullName.toLowerCase().includes(q) ||
        item.peer?.username.toLowerCase().includes(q),
    )
  }, [items, query])

  const toggleSelect = useCallback(
    (conversationId: string) => {
      if (selectedIds.has(conversationId)) {
        const next = new Set(selectedIds)
        next.delete(conversationId)
        setSelectedIds(next)
        return
      }

      if (selectedIds.size >= MAX_FORWARD_CHATS) {
        toast({
          title: "Limit reached",
          description: `You can only share with up to ${MAX_FORWARD_CHATS} chats.`,
        })
        return
      }

      setSelectedIds(new Set(selectedIds).add(conversationId))
    },
    [selectedIds, toast],
  )

  const forwardNow = useCallback(async () => {
    if (forwardingRef.current || selectedIds.size === 0 || messageIds.length === 0) return

    if (!online) {
      toast({
        title: "Cannot forward messages",
        description: "You're offline. Try again when connected.",
        variant: "destructive",
      })
      return
    }

    // Leave the picker immediately; the send continues in the background so
    // the user is not blocked on N publishes.
    forwardingRef.current = true
    router.back()

    const targets = [...selectedIds]
    let sent = 0
    try {
      const rows = await db
        .select()
        .from(messagesTable)
        .where(inArray(messagesTable.uid, messageIds))
        .orderBy()

      for (const conversationId of targets) {
        const channel = conversationChannel(conversationId)
        for (const row of rows) {
          const data = toSendData(row)
          if (!data) continue
          await publish(channel, { eventType: MESSAGE_EVENT.send, data })
          sent += 1
        }
      }

      toast({
        title: "Forwarded",
        description: `Sent ${sent} message${sent === 1 ? "" : "s"} to ${targets.length} chat${targets.length === 1 ? "" : "s"}.`,
      })
    } catch {
      toast({ title: "Could not forward", variant: "destructive" })
    }
  }, [db, messageIds, online, publish, selectedIds, toast])

  const renderItem = useCallback<ListRenderItem<ChatListItem>>(
    ({ item }) => {
      const selected = selectedIds.has(item.conversationId)

      return (
        <ConversationRow
          item={item}
          onPress={() => toggleSelect(item.conversationId)}
          trailing={
            <View
              className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                selected ? "border-primary bg-primary" : "border-muted-foreground/40"
              }`}
            >
              {selected ? <Check size={14} color={colors.primaryForeground} /> : null}
            </View>
          }
        />
      )
    },
    [colors.primaryForeground, selectedIds, toggleSelect],
  )

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
        >
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text variant="large" numberOfLines={1} className="flex-1 text-base">
          Forward to
        </Text>
        <View className="min-w-6 items-center">
          <Text variant="small" className="text-muted-foreground">
            {messageIds.length}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2 px-4 py-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-full bg-secondary px-3">
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or username"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            className="flex-1 py-2 text-base text-foreground"
            accessibilityLabel="Search conversations"
          />
        </View>
      </View>

      <FlashList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.conversationId}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="items-center justify-center px-8 py-16">
            <Text variant="large" className="text-center">
              No conversations found
            </Text>
            <Text variant="muted" className="mt-1 text-center">
              {query.trim() ? "Try a different search." : "Start a chat to forward messages."}
            </Text>
          </View>
        }
      />

      <Pressable
        onPress={() => void forwardNow()}
        accessibilityRole="button"
        accessibilityLabel="Forward messages"
        className={`absolute bottom-8 end-4 h-14 w-14 items-center justify-center rounded-full shadow-md ${
          selectedIds.size > 0 ? "bg-primary" : "bg-secondary"
        }`}
      >
        <Forward
          size={22}
          color={selectedIds.size > 0 ? colors.primaryForeground : colors.mutedForeground}
        />
      </Pressable>
    </View>
  )
}
