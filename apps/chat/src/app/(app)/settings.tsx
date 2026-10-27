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
  type LucideIcon,
} from "lucide-react-native"
import { SafeArea, SettingsGroup, SettingsIcon, SettingsRow, Text, useThemeColors } from "@repo/ui"
import Constants from "expo-constants"
import { useSettings, type ThemePreference } from "@/context/SettingsContext"

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0"

const THEME_OPTIONS: { key: ThemePreference; label: string; icon: LucideIcon }[] = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
]

/** A row whose trailing control is a boolean switch. */
function SettingSwitch({
  title,
  description,
  icon: Icon,
  value,
  onChange,
  disabled,
}: {
  title: string
  description: string
  icon: LucideIcon
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  const colors = useThemeColors()

  return (
    <SettingsRow
      title={title}
      description={description}
      leading={
        <SettingsIcon>
          <Icon size={16} color={colors.primary} />
        </SettingsIcon>
      }
      trailing={
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ false: colors.input, true: colors.primary }}
          thumbColor={colors.background}
        />
      }
    />
  )
}

/** A row that only advertises a feature that does not exist yet. */
function ComingSoonRow({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description?: string
  icon: LucideIcon
}) {
  const colors = useThemeColors()

  return (
    <SettingsRow
      title={title}
      description={description}
      leading={
        <SettingsIcon tone="neutral">
          <Icon size={16} color={colors.foreground} />
        </SettingsIcon>
      }
      value="Soon"
      chevron={false}
    />
  )
}

function ThemePicker() {
  const colors = useThemeColors()
  const { settings, setSetting } = useSettings()

  return (
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
              <Text variant="small" className={active ? "text-primary" : "text-muted-foreground"}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export default function SettingsScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const { settings, setSetting } = useSettings()

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
          <ThemePicker />
        </SettingsGroup>

        <SettingsGroup title="Notifications">
          <SettingSwitch
            title="Message notifications"
            description="Alerts for new messages"
            icon={Bell}
            value={settings.messageNotifications}
            onChange={(next) => setSetting("messageNotifications", next)}
          />
          <SettingSwitch
            title="Sound"
            description="Play a sound for new messages"
            icon={Volume2}
            value={settings.notificationSound}
            onChange={(next) => setSetting("notificationSound", next)}
            disabled={!settings.messageNotifications}
          />
          <SettingSwitch
            title="Message preview"
            description="Show message text in notifications"
            icon={MessageSquare}
            value={settings.messagePreview}
            onChange={(next) => setSetting("messagePreview", next)}
            disabled={!settings.messageNotifications}
          />
        </SettingsGroup>

        <SettingsGroup
          title="Privacy"
          footer="Read receipts tell the other person you have seen their message."
        >
          <SettingSwitch
            title="Read receipts"
            description="Share when you have read messages"
            icon={Eye}
            value={settings.readReceipts}
            onChange={(next) => setSetting("readReceipts", next)}
          />
          <ComingSoonRow
            title="Blocked contacts"
            description="Manage people you have blocked"
            icon={Lock}
          />
        </SettingsGroup>

        <SettingsGroup title="Data and storage">
          <SettingSwitch
            title="Auto-download media"
            description="Download photos on Wi-Fi"
            icon={Database}
            value={settings.mediaAutoDownload}
            onChange={(next) => setSetting("mediaAutoDownload", next)}
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
          <ComingSoonRow
            title="Share Chatslock"
            description="Invite someone to chat with you"
            icon={Share2}
          />
          <ComingSoonRow title="Report a problem" icon={Bug} />
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
