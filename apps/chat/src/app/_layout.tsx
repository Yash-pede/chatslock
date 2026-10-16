import {ThemeProvider} from "@repo/ui";
import {SplashScreen, Stack} from "expo-router";
import {StatusBar} from "expo-status-bar";
import {useEffect} from "react";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {configureApi} from "@repo/utils";
import {AuthProvider, useAuth} from "@/utils/AuthContext";

// Hand the API URL (from EXPO_PUBLIC_API_URL in .env) to the shared client.
// Expo inlines EXPO_PUBLIC_* into the app bundle, so no URL lives in code.
configureApi(process.env.EXPO_PUBLIC_API_URL);

// Hold the splash until we know whether the user is signed in, so the app
// never flashes the wrong half of the navigation tree.
SplashScreen.preventAutoHideAsync();

/**
 * Keeps the splash screen up while silent auth resolves, then hides it.
 */
function SplashScreenController() {
    const {isLoading, isAuthenticated} = useAuth();

    useEffect(() => {
        if (!isLoading) {
            SplashScreen.hideAsync();
        }
    }, [isLoading]);

    return null;
}

/**
 * Guards the two halves of the app with Expo Router's protected routes. The
 * index is only reachable when signed in; the auth flow only when signed out.
 * A signed-out user hitting a protected route is redirected to the first
 * available screen (the auth flow), and vice versa.
 */
function RootNavigator() {
    const {isAuthenticated} = useAuth();

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                animation: "slide_from_right",
            }}
        >
            <Stack.Protected guard={isAuthenticated}>
                <Stack.Screen name="index"/>
                <Stack.Screen name="onboarding" options={{animation: "fade"}}/>
            </Stack.Protected>

            <Stack.Protected guard={!isAuthenticated}>
                <Stack.Screen name="auth" options={{animation: "fade"}}/>
            </Stack.Protected>

            {/* Deep links land here in either auth state, then redirect. */}
            <Stack.Screen name="u/[id]"/>
        </Stack>
    );
}

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <ThemeProvider>
                <StatusBar style="auto"/>
                <AuthProvider>
                    <SplashScreenController/>
                    <RootNavigator/>
                </AuthProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}
