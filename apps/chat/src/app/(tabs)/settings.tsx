import { Pressable, StyleSheet, View } from "react-native";
import {
  AppHeader,
  Avatar,
  Icon,
  ListSection,
  Screen,
  Text,
  sizing,
  spacing,
  useTheme,
  useThemeMode,
} from "@repo/ui";
import { useAuth } from "@/utils/AuthContext";
import { useToast } from "@/utils/ToastProvider";

const MODE_LABEL = {
  system: "System",
  light: "Light",
  dark: "Dark",
} as const;

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { mode, cycleMode } = useThemeMode();
  const { profile, user, logout } = useAuth();
  const { showToast } = useToast();

  const comingSoon = (title: string) => showToast({ title });

  const name = profile?.fullName || user?.username || "Your profile";
  const username = profile?.username || user?.username || "";
  const phone = profile?.phone || user?.phone || "";

  const confirmSignOut = () => {
    void logout();
  };

  return (
    <Screen
      testID="settings"
      center={false}
      padded={false}
      header={<AppHeader title="Settings" />}
    >
      <View style={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your account"
          onPress={() => comingSoon("Edit profile")}
          style={({ pressed }) => [
            styles.account,
            pressed && { backgroundColor: colors.pressed },
          ]}
        >
          <Avatar uri={profile?.imageUrl} name={name} size={64} />

          <View style={styles.accountText}>
            <Text variant="headline" numberOfLines={1}>
              {name}
            </Text>
            {phone ? (
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {phone}
              </Text>
            ) : null}
            {username ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                @{username}
              </Text>
            ) : null}
          </View>

          <Icon name="qr" size={sizing.icon} color={colors.primary} />
        </Pressable>

        <ListSection
          title="Preferences"
          style={styles.section}
          items={[
            {
              label: "Notifications and Sounds",
              icon: "bell",
              onPress: () => comingSoon("Notifications and Sounds"),
            },
            {
              label: "Privacy and Security",
              icon: "lock",
              onPress: () => comingSoon("Privacy and Security"),
            },
            {
              label: "Data and Storage",
              icon: "database",
              onPress: () => comingSoon("Data and Storage"),
            },
            {
              label: "Appearance",
              icon: "moon",
              value: MODE_LABEL[mode],
              onPress: cycleMode,
            },
          ]}
        />

        <ListSection
          title="Support"
          style={styles.section}
          items={[
            {
              label: "Help",
              icon: "help",
              onPress: () => comingSoon("Help"),
            },
          ]}
        />

        <ListSection
          style={styles.section}
          items={[
            {
              label: "Sign out",
              icon: "logout",
              destructive: true,
              chevron: false,
              onPress: confirmSignOut,
            },
          ]}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  accountText: {
    flex: 1,
    gap: spacing.xxs,
  },
  section: {
    marginTop: spacing.xxl,
  },
});
