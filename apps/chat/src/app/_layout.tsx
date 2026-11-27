import type { ReactNode } from "react"
import { View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { Stack, type ErrorBoundaryProps } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { BrandMark, Button, SafeArea, Spinner, Text, ThemeProvider, ToastProvider } from "@repo/ui"
import { AuthProvider } from "@/context/AuthContext"
import { ProfileProvider, useProfile } from "@/context/profile/ProfileContext"
import { SettingsProvider } from "@/context/SettingsContext"
import { RealtimeGate, useRealtime } from "@/context/RealtimeContext"
import { LocalDbProvider } from "@/db"
import { UnverifiedGate } from "@/components/unverified-gate"
import type { Flow } from "@/context/profile/profile"
import "../../global.css"
import { NotificationProvider } from "@/context/NotificationContext"

const appIcon = require("../../assets/files/icon-1024.png")
const OFFLINE_BANNER_HEIGHT = 28

/**
 * App chrome shared by every route. The offline banner covers the status-bar
 * area and shifts the navigator by its content height; screens keep their own
 * top safe-area inset, so content starts exactly below the banner.
 */
function AppFrame({ children }: { children: ReactNode }) {
  const { online } = useRealtime()
  const insets = useSafeAreaInsets()

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={online ? "auto" : "light"} />
      <View className="flex-1" style={{ paddingTop: online ? 0 : OFFLINE_BANNER_HEIGHT }}>
        {children}
      </View>
      {!online ? (
        <View
          className="absolute left-0 right-0 z-50 bg-destructive"
          style={{
            top: 0,
            height: insets.top + OFFLINE_BANNER_HEIGHT,
            paddingTop: insets.top,
          }}
          accessibilityLiveRegion="polite"
        >
          <View className="flex-1 items-center justify-center px-3">
            <Text variant="small" className="font-medium text-destructive-foreground">
              You&apos;re offline — showing saved content
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

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
        <Stack.Screen name="sessions" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <LocalDbProvider fallback={<LoadingGate />}>
          <ToastProvider>
            <AuthProvider>
              <ProfileProvider>
                <NotificationProvider>
                  <SettingsProvider>
                    <RealtimeGate>
                      <AppFrame>
                        <RootNavigator />
                      </AppFrame>
                    </RealtimeGate>
                  </SettingsProvider>
                </NotificationProvider>
              </ProfileProvider>
            </AuthProvider>
          </ToastProvider>
        </LocalDbProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
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
