import { Pressable, View } from "react-native"
import { Camera } from "lucide-react-native"
import { Button, Text, useThemeColors } from "@repo/ui"
import { UserAvatar } from "@/components/user-avatar"

const AVATAR_SIZE = 96

/** Avatar with camera badge, display name, handle and role pill. */
export function ProfileHeader({
  avatar,
  name,
  handle,
  roleLabel,
  uploading,
  onPressAvatar,
}: {
  avatar: string | null
  name: string
  handle: string
  roleLabel: string
  uploading: boolean
  onPressAvatar: () => void
}) {
  const colors = useThemeColors()

  return (
    <View className="items-center pb-2 pt-2">
      <Pressable
        onPress={onPressAvatar}
        accessibilityRole="button"
        accessibilityLabel={avatar ? "View profile photo" : "Add profile photo"}
        className="active:opacity-90"
      >
        <UserAvatar size={AVATAR_SIZE} avatar={avatar} name={name} />
        <View
          className="absolute -end-0.5 -bottom-0.5 h-8 w-8 items-center justify-center rounded-full border-[3px] border-background bg-primary"
          pointerEvents="none"
        >
          <Camera size={14} color={colors.primaryForeground} />
        </View>
      </Pressable>

      <Text variant="h4" numberOfLines={1} className="mt-3">
        {name}
      </Text>
      <View className="mt-1 flex-row items-center gap-1.5">
        <Text variant="muted">{handle}</Text>
        <Text variant="muted">·</Text>
        <View className="rounded-full bg-secondary px-2 py-0.5">
          <Text variant="small" className="text-xs font-semibold text-secondary-foreground">
            {roleLabel}
          </Text>
        </View>
      </View>

      <Button
        size="sm"
        variant={avatar ? "ghost" : "secondary"}
        className="mt-3"
        onPress={onPressAvatar}
        loading={uploading}
      >
        {uploading ? "Uploading…" : avatar ? "Edit photo" : "Add photo"}
      </Button>
    </View>
  )
}
