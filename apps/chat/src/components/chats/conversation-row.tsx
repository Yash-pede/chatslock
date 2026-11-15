import { Pressable, View } from "react-native"
import { BadgeCheck } from "lucide-react-native"
import { Text, useThemeColors } from "@repo/ui"
import type { ChatListItem } from "@/components/chats/chat-list"
import { UserAvatar } from "@/components/user-avatar"

const AVATAR_SIZE = 54

export interface ConversationRowProps {
  item: ChatListItem
  onPress?: (item: ChatListItem) => void
}

export function ConversationRow({ item, onPress }: ConversationRowProps) {
  const colors = useThemeColors()
  const hasUnread = item.unreadCount > 0
  const name = item.peer?.fullName ?? item.peer?.username ?? "Unknown"

  return (
    <Pressable
      onPress={() => onPress?.(item)}
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${name}`}
      className="flex-row items-center gap-3 px-4 active:bg-secondary/60"
    >
      <View className="relative">
        <UserAvatar size={AVATAR_SIZE} avatar={item.peer?.avatar} name={name} />
        {item.peer?.status === "ONLINE" ? (
          <View
            className="absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full border-2 bg-green-500"
            style={{ borderColor: colors.background }}
            accessibilityLabel="Online"
          />
        ) : null}
      </View>

      <View className="flex-1 gap-1 border-b border-border/60 py-2.5">
        <View className="flex-row items-center gap-1">
          <Text variant="large" numberOfLines={1} className="shrink">
            {name}
          </Text>
          {item.peer ? (
            <BadgeCheck size={15} color={colors.mutedForeground} strokeWidth={2} />
          ) : null}
          <View className="flex-1" />
        </View>

        <View className="flex-row items-center gap-1">
          <Text variant="small" numberOfLines={1} className="flex-1 text-primary">
            Get started — say hello
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
