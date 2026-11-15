import { router } from "expo-router"
import { ChevronLeft } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { Text, useThemeColors } from "@repo/ui"
import { formatDistanceToNow } from "date-fns"
import type { PeerUserStatus } from "@repo/types/req"
import { UserAvatar } from "@/components/user-avatar"

/** Conversation top bar: back, peer identity and presence. */
export function ConversationHeader({
  name,
  avatar,
  peerStatus,
  lastActiveAt,
  typing = false,
  onPressProfile,
}: {
  name: string
  avatar?: string
  peerStatus?: PeerUserStatus
  /** Used for the offline label: "Last active 5 minutes ago". */
  lastActiveAt?: number
  /** Takes precedence over the online/offline label. */
  typing?: boolean
  /** Opens the peer's public profile (`/u/<username>`). */
  onPressProfile?: () => void
}) {
  const colors = useThemeColors()
  const statusLabel = typing
    ? "typing…"
    : peerStatus === "ONLINE"
      ? "Online"
      : peerStatus === "OFFLINE"
        ? lastActiveAt
          ? `Last active ${formatDistanceToNow(lastActiveAt, { addSuffix: true })}`
          : "Offline"
        : "Direct message"
  const statusClass = typing || peerStatus === "ONLINE" ? "text-green-600" : "text-muted-foreground"

  return (
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

      <Pressable
        onPress={onPressProfile}
        disabled={!onPressProfile}
        accessibilityRole="button"
        accessibilityLabel={`View ${name}'s profile`}
        hitSlop={6}
        className="flex-1 flex-row items-center gap-2 active:opacity-80"
      >
        <UserAvatar size={38} avatar={avatar} name={name} />

        <View className="flex-1 ps-1">
          <Text variant="large" numberOfLines={1} className="text-base">
            {name}
          </Text>
          <Text variant="small" numberOfLines={1} className={`font-normal ${statusClass}`}>
            {statusLabel}
          </Text>
        </View>
      </Pressable>
    </View>
  )
}
