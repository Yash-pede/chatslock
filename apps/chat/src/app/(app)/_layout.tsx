import { Tabs } from "expo-router"
import { MessageSquare, Settings, UserRound } from "lucide-react-native"
import { TabBar, TabBarItem, useThemeColors } from "@repo/ui"

type TabKey = "index" | "profile" | "settings"

const TABS: { key: TabKey; label: string; icon: typeof MessageSquare }[] = [
  { key: "index", label: "Chats", icon: MessageSquare },
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "settings", label: "Settings", icon: Settings },
]

/**
 * Signed-in shell. AniUI's `TabBar` replaces the default bottom bar, so Expo
 * Router keeps owning navigation (deep links, history, back behaviour) while
 * the visual tab bar stays ours. The realtime socket lives at the root
 * layout, gated on auth, so it survives navigation across route groups.
 */
export default function AppTabsLayout() {
  const colors = useThemeColors()

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, insets, navigateToTab }) => {
        const activeRoute = state.routes[state.index]
        const activeName = activeRoute?.name as TabKey | undefined

        return (
          <TabBar style={{ paddingBottom: insets.bottom + 6 }} variant="default">
            {TABS.map(({ key, label, icon: Icon }) => {
              const route = state.routes.find((item) => item.name === key)
              const active = activeName === key

              return (
                <TabBarItem
                  key={key}
                  active={active}
                  label={label}
                  icon={
                    <Icon
                      size={20}
                      color={active ? colors.primary : colors.mutedForeground}
                      strokeWidth={active ? 2.2 : 1.8}
                    />
                  }
                  onPress={() => {
                    if (route && !active) navigateToTab(route.key)
                  }}
                />
              )
            })}
          </TabBar>
        )
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Chats" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  )
}
