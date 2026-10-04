import { ThemeProvider } from "@chatslock/ui";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        >
          {/*<Stack.Screen name="index" />*/}
          <Stack.Screen name="auth" options={{ animation: "fade" }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
