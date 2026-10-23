import { Pressable, ScrollView, Switch, View } from "react-native"
import { useRouter } from "expo-router"
import {
  Bell,
  Bug,
  Database,
  Eye,
  Info,
  Lock,
  MessageSquare,
  Monitor,
  Moon,
  Share2,
  Sun,
  UserRound,
  Volume2,
} from "lucide-react-native"
import { SafeArea, SettingsGroup, SettingsIcon, SettingsRow, Text, useThemeColors } from "@repo/ui"
import { useSettings, type ThemePreference } from "@/context/SettingsContext"

const THEME_OPTIONS: { key: ThemePreference; label: string; icon: typeof Sun }[] = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
]

const APP_VERSION = "1.0.0"

/**
 * Settings modelled on Telegram: grouped cards, an inline theme switcher, and
 * notification/privacy toggles. Everything persists locally through
 * `SettingsContext`; features that need backend support are marked as such
 * instead of pretending to work.
 */
export default function SettingsScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const { settings, setSetting } = useSettings()

  const toggle =
    (
      key:
        | "messageNotifications"
        | "notificationSound"
        | "messagePreview"
        | "readReceipts"
        | "mediaAutoDownload",
    ) =>
    (value: boolean) =>
      setSetting(key, value)

  return (
    <SafeArea edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerClassName="gap-5 px-4 pb-10 pt-3"
        showsVerticalScrollIndicator={false}
      >
        <Text className="px-1 text-[1.9rem] font-bold tracking-tight text-foreground">
          Settings
        </Text>

        <SettingsGroup title="Appearance">
          <View className="gap-3 p-4">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-base font-medium text-foreground">Theme</Text>
              <Text variant="small" className="font-normal text-muted-foreground">
                {THEME_OPTIONS.find((option) => option.key === settings.theme)?.label ?? "System"}
              </Text>
            </View>
            <View className="flex-row gap-2 rounded-xl bg-secondary p-1">
              {THEME_OPTIONS.map(({ key, label, icon: Icon }) => {
                const active = settings.theme === key

                return (
                  <Pressable
                    key={key}
                    onPress={() => setSetting("theme", key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${label} theme`}
                    className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${
                      active ? "bg-card" : "bg-transparent"
                    }`}
                  >
                    <Icon
                      size={15}
                      color={active ? colors.primary : colors.mutedForeground}
                      strokeWidth={2}
                    />
                    <Text
                      variant="small"
                      className={active ? "text-primary" : "text-muted-foreground"}
                    >
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </SettingsGroup>

        <SettingsGroup title="Notifications">
          <SettingsRow
            title="Message notifications"
            description="Alerts for new messages"
            leading={
              <SettingsIcon>
                <Bell size={16} color={colors.primary} />
              </SettingsIcon>
            }
            trailing={
              <Switch
                value={settings.messageNotifications}
                onValueChange={toggle("messageNotifications")}
                trackColor={{ false: colors.input, true: colors.primary }}
                thumbColor={colors.background}
              />
            }
          />
          <SettingsRow
            title="Sound"
            description="Play a sound for new messages"
            leading={
              <SettingsIcon>
                <Volume2 size={16} color={colors.primary} />
              </SettingsIcon>
            }
            trailing={
              <Switch
                value={settings.notificationSound}
                onValueChange={toggle("notificationSound")}
                disabled={!settings.messageNotifications}
                trackColor={{ false: colors.input, true: colors.primary }}
                thumbColor={colors.background}
              />
            }
          />
          <SettingsRow
            title="Message preview"
            description="Show message text in notifications"
            leading={
              <SettingsIcon>
                <MessageSquare size={16} color={colors.primary} />
              </SettingsIcon>
            }
            trailing={
              <Switch
                value={settings.messagePreview}
                onValueChange={toggle("messagePreview")}
                disabled={!settings.messageNotifications}
                trackColor={{ false: colors.input, true: colors.primary }}
                thumbColor={colors.background}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup
          title="Privacy"
          footer="Read receipts tell the other person you have seen their message."
        >
          <SettingsRow
            title="Read receipts"
            description="Share when you have read messages"
            leading={
              <SettingsIcon>
                <Eye size={16} color={colors.primary} />
              </SettingsIcon>
            }
            trailing={
              <Switch
                value={settings.readReceipts}
                onValueChange={toggle("readReceipts")}
                trackColor={{ false: colors.input, true: colors.primary }}
                thumbColor={colors.background}
              />
            }
          />
          <SettingsRow
            title="Blocked contacts"
            description="Manage people you have blocked"
            leading={
              <SettingsIcon>
                <Lock size={16} color={colors.primary} />
              </SettingsIcon>
            }
            trailing={
              <Text variant="small" className="font-normal text-muted-foreground">
                Soon
              </Text>
            }
          />
        </SettingsGroup>

        <SettingsGroup title="Data and storage">
          <SettingsRow
            title="Auto-download media"
            description="Download photos on Wi-Fi"
            leading={
              <SettingsIcon>
                <Database size={16} color={colors.primary} />
              </SettingsIcon>
            }
            trailing={
              <Switch
                value={settings.mediaAutoDownload}
                onValueChange={toggle("mediaAutoDownload")}
                trackColor={{ false: colors.input, true: colors.primary }}
                thumbColor={colors.background}
              />
            }
          />
          <SettingsRow
            title="Storage usage"
            description="Cache and downloads"
            leading={
              <SettingsIcon tone="neutral">
                <Database size={16} color={colors.foreground} />
              </SettingsIcon>
            }
            value="Soon"
            chevron={false}
          />
        </SettingsGroup>

        <SettingsGroup title="More">
          <SettingsRow
            title="My profile"
            description="Name, photo and public link"
            onPress={() => router.navigate("/profile")}
            leading={
              <SettingsIcon tone="neutral">
                <UserRound size={16} color={colors.foreground} />
              </SettingsIcon>
            }
          />
          <SettingsRow
            title="Share Chatslock"
            description="Invite someone to chat with you"
            leading={
              <SettingsIcon tone="neutral">
                <Share2 size={16} color={colors.foreground} />
              </SettingsIcon>
            }
            value="Soon"
            chevron={false}
          />
          <SettingsRow
            title="Report a problem"
            leading={
              <SettingsIcon tone="neutral">
                <Bug size={16} color={colors.foreground} />
              </SettingsIcon>
            }
            value="Soon"
            chevron={false}
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            title="About Chatslock"
            leading={
              <SettingsIcon tone="neutral">
                <Info size={16} color={colors.foreground} />
              </SettingsIcon>
            }
            value={`v${APP_VERSION}`}
            chevron={false}
          />
        </SettingsGroup>

        <Text variant="small" className="text-center font-normal text-muted-foreground">
          Chatslock v{APP_VERSION}
        </Text>
      </ScrollView>
    </SafeArea>
  )
}
