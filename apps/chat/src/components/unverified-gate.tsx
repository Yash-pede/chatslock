import { View } from "react-native"
import { AlertCircle, LogOut, RefreshCw } from "lucide-react-native"
import { Button, SafeArea, Text, useThemeColors } from "@repo/ui"

interface UnverifiedGateProps {
  error: string | null
  onRetry: () => void
  onSignOut: () => void
}

/**
 * Shown when a session exists but `/users/me` could not confirm it. Rendered
 * inline by the root layout (not as a route) so no screens mount or redirect
 * while the session is unconfirmed.
 */
export function UnverifiedGate({ error, onRetry, onSignOut }: UnverifiedGateProps) {
  const colors = useThemeColors()

  return (
    <SafeArea>
      <View className="flex-1 justify-center gap-5 px-6">
        <View>
          <Text variant="h2" className="text-center">
            {"We couldn't load your account"}
          </Text>
          <Text variant="muted" className="mt-2 text-center leading-5">
            Your session is still saved. Check your connection and try again.
          </Text>
        </View>

        <View className="flex-row items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-3 ps-4 pe-4">
          <AlertCircle size={16} color={colors.destructive} />
          <Text variant="small" className="flex-1 font-normal text-destructive">
            {error ?? "Could not reach the server."}
          </Text>
        </View>

        <View className="items-center">
          <Button
            className="min-w-40"
            icon={<RefreshCw size={16} color={colors.primaryForeground} />}
            onPress={onRetry}
          >
            Try again
          </Button>
        </View>

        <View className="items-center">
          <Button
            variant="ghost"
            size="sm"
            icon={<LogOut size={14} color={colors.mutedForeground} />}
            onPress={onSignOut}
          >
            Sign out
          </Button>
        </View>
      </View>
    </SafeArea>
  )
}
