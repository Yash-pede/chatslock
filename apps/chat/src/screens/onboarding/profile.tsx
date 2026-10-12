import { useState } from "react";
import { useRouter } from "expo-router";
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
} from "@chatslock/ui";

/** Lowercase handle: 3–20 letters, digits or underscores. */
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/**
 * The single onboarding screen: an optional profile picture, a username and a
 * first/last name. Continue is the only way forward and stays disabled until
 * every required field is filled.
 */
export function OnboardingProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const trimmedUsername = username.trim();
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();

  const usernameValid = USERNAME_PATTERN.test(trimmedUsername);
  const canContinue =
    usernameValid && trimmedFirst.length > 0 && trimmedLast.length > 0;

  const fullName = [trimmedFirst, trimmedLast].filter(Boolean).join(" ");

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

  const handleContinue = () => {
    // No profile endpoint yet — the details are captured here and the flow
    // continues into the app. Point this at the API once it exists.
    router.replace("/");
  };

  return (
    <AuthShell
      title="Set up your profile"
      subtitle="Add a photo and tell us your name to get started."
    >
      <View style={styles.avatar}>
        <Avatar
          uri={avatarUri}
          name={fullName || trimmedUsername}
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
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Ada"
        autoComplete="given-name"
        textContentType="givenName"
        maxLength={50}
        testID="onboarding-first-name"
      />

      <TextField
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        placeholder="Lovelace"
        autoComplete="family-name"
        textContentType="familyName"
        maxLength={50}
        testID="onboarding-last-name"
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
