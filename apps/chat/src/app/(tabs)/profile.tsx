import { Alert, StyleSheet, View } from "react-native";
import {
  AppHeader,
  Avatar,
  IconButton,
  ListSection,
  Screen,
  Text,
  spacing,
} from "@repo/ui";
import { useAuth } from "@/utils/AuthContext";

const comingSoon = (title: string) =>
  Alert.alert(title, "This screen is coming soon.");

function memberSinceLabel(createdAt?: number): string {
  if (!createdAt) return "Not available";
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * The signed-in user's own profile.
 *
 * Read-only for now: the edit action and the photo affordance both announce
 * that editing is coming, while the details come from the profile row so the
 * screen already reflects real onboarding data.
 */
export default function ProfileScreen() {
  const { profile, user } = useAuth();

  const name = profile?.fullName || user?.username || "Your profile";
  const username = profile?.username || user?.username || "";
  const phone = profile?.phone || user?.phone || "";

  return (
    <Screen
      testID="profile"
      center={false}
      padded={false}
      header={
        <AppHeader
          title="Profile"
          actions={
            <IconButton
              name="edit"
              accessibilityLabel="Edit profile"
              onPress={() => comingSoon("Edit profile")}
            />
          }
        />
      }
    >
      <View style={styles.content}>
        <View style={styles.identity}>
          <Avatar
            uri={profile?.imageUrl}
            name={name}
            size={112}
            editable
            onPress={() => comingSoon("Profile photo")}
          />

          <View style={styles.names}>
            <Text variant="title" numberOfLines={2} style={styles.name}>
              {name}
            </Text>
            {username ? (
              <Text variant="subhead" tone="secondary">
                @{username}
              </Text>
            ) : null}
            {phone ? (
              <Text variant="caption" tone="tertiary">
                {phone}
              </Text>
            ) : null}
          </View>
        </View>

        <ListSection
          title="Account"
          style={styles.section}
          items={[
            {
              label: "Username",
              icon: "at",
              value: username ? `@${username}` : "Not set",
            },
            {
              label: "Phone number",
              icon: "phone",
              value: phone || "Not set",
            },
            {
              label: "Member since",
              icon: "clock",
              value: memberSinceLabel(profile?.createdAt),
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
  identity: {
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  names: {
    alignItems: "center",
    gap: spacing.xxs,
  },
  name: {
    textAlign: "center",
  },
  section: {
    marginTop: spacing.lg,
  },
});
