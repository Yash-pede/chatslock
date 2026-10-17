import { Tabs } from "expo-router/js-tabs";
import { AppTabBar } from "@/components/app-tab-bar";

/**
 * The signed-in app shell: chats, settings and profile.
 *
 * The header is hidden because each screen draws its own large `AppHeader`;
 * the custom tab bar supplies the themed navigation chrome.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Chats" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
