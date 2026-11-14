import { View } from "react-native"
import { WifiOff } from "lucide-react-native"
import { BrandMark, Button, SafeArea, Text, useThemeColors } from "@repo/ui"

const appIcon = require("../../assets/files/icon-1024.png")

/**
 * Full-screen offline state for the signed-out flow: without a connection the
 * phone/agent forms cannot call the API, so they are replaced entirely.
 */
export function NoInternetScreen({
  onRetry,
  checking = false,
}: {
  onRetry: () => void | Promise<void>
  checking?: boolean
}) {
  const colors = useThemeColors()

  return (
    <SafeArea>
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <BrandMark source={appIcon} className="mb-6" />

        <View className="h-16 w-16 items-center justify-center rounded-full bg-secondary">
          <WifiOff size={28} color={colors.mutedForeground} />
        </View>

        <Text variant="h2" className="text-center">
          No internet connection
        </Text>
        <Text variant="muted" className="max-w-[280px] text-center leading-5">
          Check your connection and try again.
        </Text>

        <Button onPress={() => void onRetry()} loading={checking} className="mt-4 min-w-40">
          Try again
        </Button>
      </View>
    </SafeArea>
  )
}
