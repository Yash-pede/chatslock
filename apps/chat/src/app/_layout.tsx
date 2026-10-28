import { View } from "react-native"
import { Stack, type ErrorBoundaryProps } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { BrandMark, Button, SafeArea, Spinner, Text, ThemeProvider, ToastProvider } from "@repo/ui"
import { AuthProvider } from "@/context/AuthContext"
import { ProfileProvider, useProfile } from "@/context/profile/ProfileContext"
import { SettingsProvider } from "@/context/SettingsContext"
import { WsGate } from "@/context/WebSocketContext"
import { UnverifiedGate } from "@/components/unverified-gate"
import type { Flow } from "@/context/profile/profile"
import "../../global.css"

const appIcon = require("../../assets/files/icon-1024.png")

/** Splash while the session is restored and the profile is loaded. */
function LoadingGate() {
  return (
    <SafeArea>
      <View className="flex-1 items-center justify-center gap-4">
        <BrandMark source={appIcon} />
        <Spinner size="sm" />
      </View>
    </SafeArea>
  )
}

/**
 * Splash/verified gates render instead of the navigator; the navigator itself
 * is guarded by the flow (see `ProtectedNavigator`). The flow is the single
 * routing input: it is derived from the session plus `GET /me`.
 */
function RootNavigator() {
  const { flow, error, reload, reset } = useProfile()

  if (flow === "loading") return <LoadingGate />

  if (flow === "unverified") {
    return (
      <UnverifiedGate error={error} onRetry={() => void reload()} onSignOut={() => void reset()} />
    )
  }

  return <ProtectedNavigator flow={flow} />
}

/**
 * Screens are protected per flow so `Stack.Protected` handles navigation in
 * one place (no redirect effect to race against):
 * - signedOut: only the sign-in screens exist. A verified user therefore can
 *   never see `/login` again: as soon as the session exists the guard flips.
 * - onboarding: only the profile-completion screen exists.
 * - ready: only the app exists.
 * Public links (`u/[id]`) stay mounted so a shared link keeps working.
 */
function ProtectedNavigator({ flow }: { flow: Flow }) {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="u/[id]" />
      <Stack.Protected guard={flow === "signedOut"}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={flow === "onboarding"}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={flow === "ready"}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="conversation/[id]" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <ProfileProvider>
            <SettingsProvider>
              <WsGate>
                <StatusBar style="auto" />
                <RootNavigator />
              </WsGate>
            </SettingsProvider>
          </ProfileProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

/** Renders route errors instead of crashing the whole tree. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeArea>
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <BrandMark source={appIcon} />
        <Text variant="muted" className="text-center">
          {error.message || "Something went wrong."}
        </Text>
        <Button onPress={() => void retry()}>Try again</Button>
      </View>
    </SafeArea>
  )
}
