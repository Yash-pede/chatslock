import { View } from "react-native"
import { Stack, type ErrorBoundaryProps } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { BrandMark, Button, SafeArea, Spinner, Text, ThemeProvider, ToastProvider } from "@repo/ui"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import { SettingsProvider } from "@/context/SettingsContext"
import { WsGate } from "@/context/WebSocketContext"
import { UnverifiedGate } from "@/components/unverified-gate"
import "../../global.css"

/** Splash while tokens are restored and `/me` is checked. */
function LoadingGate() {
  return (
    <SafeArea>
      <View className="flex-1 items-center justify-center gap-4">
        <BrandMark />
        <Spinner size="sm" />
      </View>
    </SafeArea>
  )
}

/**
 * Auth guards live on the stack itself: each phase either protects or exposes
 * its screens, and API Gateway-style `redirectTo` handles the navigation in
 * one place (no redirect effect to race against).
 */
/**
 * Splash/verified gates render instead of the navigator; the navigator itself
 * is phase-protected (see `ProtectedNavigator`).
 */
function RootNavigator() {
  const { phase, error, reloadProfile, signOut } = useAuth()

  if (phase === "loading") return <LoadingGate />

  if (phase === "unverified") {
    return (
      <UnverifiedGate
        error={error}
        onRetry={() => void reloadProfile()}
        onSignOut={() => void signOut()}
      />
    )
  }

  return <ProtectedNavigator />
}

/**
 * Per-phase screen protection, applied by wrapping the navigator differently
 * per phase so `Stack.Protected` guards stay in sync with auth without any
 * redirect effect:
 * - unauthenticated/onboarding: auth screens open, app screens redirect away
 * - ready: app screens open, auth screens redirect away
 */
function ProtectedNavigator() {
  const { phase } = useAuth()
  const authAllowed = phase === "unauthenticated" || phase === "onboarding"
  const appAllowed = phase === "ready"

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={authAllowed}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={phase === "onboarding"}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={appAllowed}>
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
          <SettingsProvider>
            <WsGate>
              <StatusBar style="auto" />
              <RootNavigator />
            </WsGate>
          </SettingsProvider>
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
        <BrandMark />
        <Text variant="muted" className="text-center">
          {error.message || "Something went wrong."}
        </Text>
        <Button onPress={() => void retry()}>Try again</Button>
      </View>
    </SafeArea>
  )
}
