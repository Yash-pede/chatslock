import { Pressable, View } from "react-native"
import { X } from "lucide-react-native"
import { Text, useThemeColors } from "@repo/ui"

/** Dismissible inline error banner. */
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const colors = useThemeColors()

  return (
    <View className="flex-row items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2">
      <Text variant="small" className="flex-1 font-normal text-destructive">
        {message}
      </Text>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Dismiss error">
        <X size={16} color={colors.destructive} />
      </Pressable>
    </View>
  )
}
