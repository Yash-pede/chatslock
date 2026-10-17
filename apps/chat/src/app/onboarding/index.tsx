import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { StyleSheet, View } from "react-native";
import {
  AuthShell,
  Avatar,
  Button,
  Text,
  TextField,
  spacing,
  useTheme,
} from "@repo/ui";
import { extractErrorMessage } from "@repo/utils/auth";
import { clearPendingAgentId, getPendingAgentId } from "@/utils/pendingAgent";
import { onboardUser } from "@/api/users";
import { useAuth } from "@/utils/AuthContext";

/** Lowercase handle: 3–20 letters, digits or underscores. */
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
/** Matches the backend's full-name minimum. */
const FULL_NAME_MIN = 3;

/**
 * Route `/onboarding` — the one-screen profile setup: an optional picture, a
 * username and a full name. Completing it refreshes the profile, which flips
 * `isOnboarded` and lets the route guard move the user into the app.
 */
export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { refreshProfile } = useAuth();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;

    void getPendingAgentId().then((id) => {
      if (active) setAgentId(id ?? undefined);
    });

    return () => {
      active = false;
    };
  }, []);

  const trimmedUsername = username.trim();
  const trimmedFullName = fullName.trim();

  const usernameValid = USERNAME_PATTERN.test(trimmedUsername);
  const canContinue = usernameValid && trimmedFullName.length >= FULL_NAME_MIN;

  const pickAvatar = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled) {
        setAvatarUri(result.assets[0]?.uri ?? null);
      }
    } catch {
      setError("Couldn't open your photos. Please try again.");
    }
  };

  const handleContinue = async () => {
    if (loading) return;

    setError(null);
    setLoading(true);
    try {
      await onboardUser({
        username: trimmedUsername,
        fullName: trimmedFullName,
        ...(agentId ? { agentId } : {}),
      });
      await clearPendingAgentId();
      await refreshProfile();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Set up your profile"
      subtitle="Add a photo and tell us your name to get started."
    >
      <View style={styles.avatar}>
        <Avatar
          uri={avatarUri}
          name={trimmedFullName || trimmedUsername}
          size={96}
          editable
          onPress={pickAvatar}
          testID="onboarding-avatar"
        />
        <Text variant="caption" tone="tertiary">
          Optional
        </Text>
      </View>

      <TextField
        label="Username"
        value={username}
        onChangeText={(value) => setUsername(value.toLowerCase())}
        placeholder="yourname"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        maxLength={20}
        hint="3–20 characters. Letters, numbers and underscores."
        error={
          trimmedUsername.length > 0 && !usernameValid
            ? "Use 3–20 lowercase letters, numbers or underscores."
            : undefined
        }
        testID="onboarding-username"
      />

      <TextField
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        placeholder="Ada Lovelace"
        autoComplete="name"
        textContentType="name"
        maxLength={50}
        testID="onboarding-full-name"
      />

      {error ? (
        <Text
          variant="caption"
          accessibilityLiveRegion="polite"
          style={{ color: colors.destructive }}
        >
          {error}
        </Text>
      ) : null}

      <Button
        label="Continue"
        block
        disabled={!canContinue}
        loading={loading}
        loadingLabel="Setting up"
        onPress={handleContinue}
        testID="onboarding-continue"
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    gap: spacing.xs,
  },
});
