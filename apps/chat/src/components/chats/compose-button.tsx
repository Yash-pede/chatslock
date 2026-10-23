import { Pressable } from "react-native"
import { Pencil } from "lucide-react-native"
import { useThemeColors } from "@repo/ui"

/** Telegram-style floating compose button pinned to the bottom-right. */
export function ComposeButton({ onPress }: { onPress?: () => void }) {
  const colors = useThemeColors()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="New chat"
      className="absolute bottom-4 end-4 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-85"
    >
      <Pencil size={22} color={colors.primaryForeground} strokeWidth={2.2} />
    </Pressable>
  )
}
