import { useMemo } from "react"
import { Pressable, View } from "react-native"
import { BellOff, BadgeCheck, CheckCheck } from "lucide-react-native"
import { Text, useThemeColors } from "@repo/ui"
import type { ChatListItem } from "@/components/chats/chat-list"
import { UserAvatar } from "@/components/user-avatar"

const AVATAR_SIZE = 54
const DAY = 24 * 60 * 60 * 1000

/** Telegram-style timestamp: time for today, weekday for this week, date before. */
export function formatConversationTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  if (timestamp >= startOfToday) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  }
  if (timestamp >= startOfToday - DAY) return "Yesterday"
  if (timestamp > startOfToday - 7 * DAY) {
    return date.toLocaleDateString(undefined, { weekday: "short" })
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" })
}

export interface ConversationRowProps {
  item: ChatListItem
  /** True when the current user sent the last message (drives the ticks). */
  lastMessageIsMine?: boolean
  lastMessageRead?: boolean
  onPress?: (item: ChatListItem) => void
}

/**
 * One chat row built from the API: avatar (initials when there is none), peer
 * name + @username, and a preview line. With no message yet the preview becomes
 * a "Get started" nudge so fresh conversations are still tappable.
 */
export function ConversationRow({
  item,
  lastMessageIsMine = false,
  lastMessageRead = false,
  onPress,
}: ConversationRowProps) {
  const colors = useThemeColors()
  const hasUnread = item.unreadCount > 0
  const name = item.peer?.fullName ?? item.peer?.username ?? "Unknown"
  const time = useMemo(
    () => (item.lastMessageAt ? formatConversationTime(item.lastMessageAt) : undefined),
    [item.lastMessageAt],
  )
  const hasMessage = Boolean(item.lastMessagePreview || item.lastMessageAt)

  return (
    <Pressable
      onPress={() => onPress?.(item)}
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${name}`}
      className="flex-row items-center gap-3 px-4 active:bg-secondary/60"
    >
      <UserAvatar size={AVATAR_SIZE} avatar={item.peer?.avatar} name={name} />

      <View className="flex-1 gap-1 border-b border-border/60 py-2.5">
        <View className="flex-row items-center gap-1">
          <Text variant="large" numberOfLines={1} className="shrink">
            {name}
          </Text>
          {item.peer ? (
            <BadgeCheck size={15} color={colors.mutedForeground} strokeWidth={2} />
          ) : null}
          <View className="flex-1" />
          {time ? (
            <Text
              variant="small"
              className={
                hasUnread ? "font-medium text-primary" : "font-normal text-muted-foreground"
              }
            >
              {time}
            </Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-1">
          {hasMessage && lastMessageIsMine ? (
            <CheckCheck
              size={15}
              color={lastMessageRead ? colors.primary : colors.mutedForeground}
              strokeWidth={2.5}
            />
          ) : null}
          <Text
            variant="small"
            numberOfLines={1}
            className={`flex-1 ${hasMessage ? (hasUnread ? "text-foreground" : "text-muted-foreground") : "text-primary"}`}
          >
            {hasMessage ? (item.lastMessagePreview ?? "New message") : "Get started — say hello"}
          </Text>
          {hasUnread ? (
            <View className="me-4 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5">
              <Text variant="small" className="text-xs font-semibold text-primary-foreground">
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

/** Muted-bell marker kept for rows the product later marks as muted. */
export function MutedIndicator() {
  const colors = useThemeColors()
  return <BellOff size={13} color={colors.mutedForeground} strokeWidth={2} />
}
