import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import {
  AuthShell,
  Button,
  Icon,
  Text,
  spacing,
  useTheme,
} from "@repo/ui";

export function AuthMethodScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <AuthShell title="Sign in" subtitle="Choose how you'd like to continue.">
      <View style={styles.options}>
        <Button
          label="Continue with phone"
          icon="phone"
          size="lg"
          block
          onPress={() => router.push("/auth/phone")}
        />
        <Button
          label="Continue with password"
          icon="keys"
          variant="outline"
          size="lg"
          block
          onPress={() => router.push("/auth/password")}
        />
      </View>

      <View style={styles.note}>
        <Icon name="privacy" size={16} color={colors.mutedForeground} />
        <Text variant="caption" tone="tertiary" style={styles.noteText}>
          All details are Encrypted stored securely on our servers and not
          shared to any third party in any circumstance.
        </Text>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: spacing.md,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  noteText: {
    flex: 1,
  },
});
