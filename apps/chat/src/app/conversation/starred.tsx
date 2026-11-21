import { useCallback, useMemo, useState } from "react"
import { router, useLocalSearchParams } from "expo-router"
import { ChevronLeft, EllipsisVertical, StarOff } from "lucide-react-native"
import { FlashList, type ListRenderItem } from "@shopify/flash-list"
import { Modal, Pressable, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { and, desc, eq } from "drizzle-orm"
import { useLiveQuery } from "drizzle-orm/expo-sqlite"
import { Text, useThemeColors, useToast } from "@repo/ui"
import * as Clipboard from "expo-clipboard"
import {
  unstarCachedMessage,
  unstarConversationMessages,
  useLocalDb,
} from "@/db"
import { messages as messagesTable } from "@/db/schema"
import { useProfile } from "@/context/profile/ProfileContext"
import {
  cachedRowToChatMessage,
  MessageActions,
  MessageBubble,
  type ChatMessage,
} from "@/components/messages"

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 12, paddingBottom: 12 },
  row: { paddingVertical: 3 },
})

const keyExtractor = (item: ChatMessage) => item.id

/** Starred messages for one conversation from the local cache, newest first. */
export default function StarredMessagesScreen() {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { toast } = useToast()
  const { db } = useLocalDb()
  const { user } = useProfile()
  const params = useLocalSearchParams<{ id: string; name?: string }>()
  const conversationId = params.id ?? ""
  const currentUserId = user?.userId ?? null

  const [menuOpen, setMenuOpen] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const starredQuery = useMemo(
    () =>
      db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.starred, true),
            eq(messagesTable.conversationId, conversationId),
          ),
        )
        .orderBy(desc(messagesTable.createdAt)),
    [conversationId, db],
  )
  const { data: starredRows } = useLiveQuery(starredQuery, [starredQuery])

  const messages = useMemo(
    () => starredRows.map((row) => cachedRowToChatMessage(row, currentUserId)),
    [currentUserId, starredRows],
  )

  const selectedMessage = selectedId
    ? (messages.find((message) => message.id === selectedId) ?? null)
    : null

  const clearSelection = useCallback(() => setSelectedId(null), [])

  const canCopy = Boolean(selectedMessage?.text?.trim())

  const copySelected = useCallback(() => {
    const text = selectedMessage?.text
    if (!text) return
    clearSelection()
    void Clipboard.setStringAsync(text)
      .then(() => toast({ title: "Copied", description: "Message copied to clipboard." }))
      .catch(() => toast({ title: "Could not copy", variant: "destructive" }))
  }, [clearSelection, selectedMessage, toast])

  const unstarSelected = useCallback(() => {
    if (!selectedMessage) return
    clearSelection()
    void unstarCachedMessage(db, selectedMessage.id)
      .then(() => toast({ title: "Message unstarred" }))
      .catch(() => toast({ title: "Could not unstar message", variant: "destructive" }))
  }, [clearSelection, db, selectedMessage, toast])

  const unstarAll = useCallback(() => {
    setMenuOpen(false)
    void unstarConversationMessages(db, conversationId)
      .then(() => toast({ title: "Unstarred all messages", description: "All starred messages in this chat were unstarred." }))
      .catch(() => toast({ title: "Could not unstar messages", variant: "destructive" }))
  }, [conversationId, db, toast])

  const renderItem = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <View style={styles.row}>
        <MessageBubble
          message={item}
          selected={item.id === selectedId}
          onSelect={
            !item.isSystem && !item.isDeleted && item.status !== "failed"
              ? () => setSelectedId(item.id)
              : undefined
          }
        />
      </View>
    ),
    [selectedId],
  )

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View
        className="flex-row items-center gap-2 border-b border-border px-2 py-2"
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
      >
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
          Starred messages
        </Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Starred messages options"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
        >
          <EllipsisVertical size={24} color={colors.foreground} />
        </Pressable>

        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setMenuOpen(false)}
        >
          <Pressable
            className="flex-1"
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Close menu"
          >
            <View
              className="absolute end-3 rounded-xl border border-border bg-card py-1 shadow-lg"
              style={{ top: insets.top + headerHeight + 4, elevation: 4 }}
            >
              <Pressable
                onPress={unstarAll}
                accessibilityRole="button"
                accessibilityLabel="Unstar all messages"
                className="flex-row items-center gap-3 rounded-xl px-4 py-3 active:bg-secondary"
              >
                <StarOff size={20} color={colors.destructive} />
                <Text className="text-base text-destructive">Unstar all messages</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </View>

      {selectedMessage ? (
        <MessageActions
          canCopy={canCopy}
          canDownload={false}
          canEdit={false}
          canDelete={false}
          starred={true}
          onCopy={copySelected}
          onToggleStar={unstarSelected}
          onCancel={clearSelection}
        />
      ) : null}

      <FlashList
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="items-center justify-center px-8 py-16">
            <Text variant="large" className="text-center">
              No starred messages
            </Text>
            <Text variant="muted" className="mt-1 text-center">
              Star a message to find it here.
            </Text>
          </View>
        }
      />
    </View>
  )
}
