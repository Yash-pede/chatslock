import { Stack } from "expo-router"
import { View } from "react-native"
import { BrandMark, SafeArea, Spinner } from "@repo/ui"
import { NoInternetScreen } from "@/components/no-internet-screen"
import { useNetworkStatus } from "@/lib/use-network-status"

const appIcon = require("../../../assets/files/icon-1024.png")

export const unstable_settings = { anchor: "index" }

export default function LoginLayout() {
  const { status, checking, retry } = useNetworkStatus()

  if (status === "unknown") {
    return (
      <SafeArea>
        <View className="flex-1 items-center justify-center gap-4">
          <BrandMark source={appIcon} />
          <Spinner size="sm" />
        </View>
      </SafeArea>
    )
  }

  if (status === "offline") {
    return <NoInternetScreen onRetry={retry} checking={checking} />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
