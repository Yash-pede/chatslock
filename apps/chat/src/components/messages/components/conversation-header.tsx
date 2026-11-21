import { router } from "expo-router"
import { useState } from "react"
import {
  Ban,
  BellOff,
  ChevronLeft,
  EllipsisVertical,
  MessagesSquare,
  Star,
  StarOff,
} from "lucide-react-native"
import { Modal, Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
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
  starred = false,
  onPressProfile,
  onToggleStar,
  onViewStarred,
}: {
  name: string
  avatar?: string
  peerStatus?: PeerUserStatus
  /** Used for the offline label: "Last active 5 minutes ago". */
  lastActiveAt?: number
  /** Takes precedence over the online/offline label. */
  typing?: boolean
  /** Whether the conversation is starred in the local chat cache. */
  starred?: boolean
  /** Opens the peer's public profile (`/u/<username>`). */
  onPressProfile?: () => void
  /** Stars or unstars the conversation in the local chat cache. */
  onToggleStar?: () => void
  /** Opens this conversation's starred messages screen. */
  onViewStarred?: () => void
}) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const [menuOpen, setMenuOpen] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(0)
  const closeMenu = () => setMenuOpen(false)
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
    <View
      className="flex-row items-center gap-2 border-b border-border px-2 py-2"
      onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
    >
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

      <Pressable
        onPress={() => setMenuOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Conversation options"
        className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
      >
        <EllipsisVertical size={24} color={colors.foreground} />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeMenu}
      >
        <Pressable className="flex-1" onPress={closeMenu} accessibilityLabel="Close menu">
          <View
            className="absolute end-3 rounded-xl border border-border bg-card py-1 shadow-lg"
            style={{ top: insets.top + headerHeight + 4, elevation: 4 }}
          >
            <Pressable
              onPress={() => {
                closeMenu()
                onViewStarred?.()
              }}
              accessibilityRole="button"
              accessibilityLabel="View starred messages"
              className="flex-row items-center gap-3 px-4 py-3 active:bg-secondary"
            >
              <MessagesSquare size={20} color={colors.foreground} />
              <Text className="text-base text-foreground">Starred messages</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                closeMenu()
                onToggleStar?.()
              }}
              accessibilityRole="button"
              accessibilityLabel={starred ? "Unstar chat" : "Star chat"}
              className="flex-row items-center gap-3 rounded-t-xl px-4 py-3 active:bg-secondary"
            >
              {starred ? (
                <StarOff size={20} color={colors.foreground} />
              ) : (
                <Star size={20} color={colors.foreground} />
              )}
              <Text className="text-base text-foreground">
                {starred ? "Unstar chat" : "Star chat"}
              </Text>
            </Pressable>
            <Pressable
              disabled
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              className="flex-row items-center gap-3 px-4 py-3 opacity-40"
            >
              <BellOff size={20} color={colors.foreground} />
              <Text className="text-base text-foreground">Mute</Text>
            </Pressable>
            <Pressable
              disabled
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              className="flex-row items-center gap-3 rounded-b-xl px-4 py-3 opacity-40"
            >
              <Ban size={20} color={colors.foreground} />
              <Text className="text-base text-foreground">Block</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}
