import { useEffect } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  BrandMark,
  Button,
  SafeArea,
  Spinner,
  Text,
  ThemeProvider,
  useThemeColors,
} from "@repo/ui";
import { AlertCircle, LogOut, RefreshCw } from "lucide-react-native";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import "../../global.css";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * Renders route errors instead of crashing the whole tree, so a deep link or
 * redirect failure shows its message and stays retryable.
 */
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
  );
}

/**
 * Sends the user to the right place whenever the auth phase changes. During the
 * silent-restore phase a branded splash is shown instead of an empty stack.
 */
function RootNavigator() {
  const { phase, error, reloadProfile, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colors = useThemeColors();

  useEffect(() => {
    if (phase === "loading") return;

    const inAuthGroup = segments[0] === "login";

    if (phase === "unauthenticated") {
      // Only force the chooser when the user is outside the login group so a
      // pushed `/login/user` or `/login/agent` page is not replaced back to `/login`.
      if (!inAuthGroup) router.replace("/login");
      return;
    }

    if (phase === "onboarding") {
      if (segments[0] !== "onboarding") router.replace("/onboarding");
      return;
    }

    if (inAuthGroup || segments[0] === "onboarding") {
      router.replace("/");
    }
  }, [phase, segments, router]);

  if (phase === "loading") {
    return (
      <SafeArea>
        <View className="flex-1 items-center justify-center gap-4">
          <BrandMark />
          <Spinner size="sm" />
        </View>
      </SafeArea>
    );
  }

  // The session exists but `/users/me` did not confirm it. Rendering the gate
  // here (instead of a route) avoids mounting/unmounting screens in the stack,
  // which is what a redirect-based retry screen kept feeding back into.
  if (phase === "unverified") {
    return (
      <SafeArea>
        <View className="flex-1 justify-center gap-5 px-6">
          <View>
            <BrandMark className="mb-6 self-center" />
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
              onPress={() => void reloadProfile()}
            >
              Try again
            </Button>
          </View>

          <View className="items-center">
            <Button
              variant="ghost"
              size="sm"
              icon={<LogOut size={14} color={colors.mutedForeground} />}
              onPress={() => void signOut()}
            >
              Sign out
            </Button>
          </View>
        </View>
      </SafeArea>
    );
  }

  const isAuthPhase = phase === "unauthenticated" || phase === "onboarding";

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthPhase} redirectTo="/login">
        {/* `login` is a directory: `index` is the method chooser and is the
            anchor of this group, so it is always reachable as `/login`. */}
        <Stack.Screen name="login" />
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={phase === "ready"} redirectTo="/login">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
