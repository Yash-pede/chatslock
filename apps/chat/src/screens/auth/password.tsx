import { useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AuthShell, Button, Text, TextField, spacing } from "@chatslock/ui";

/**
 * Username and password sign-in — the alternative to the phone code.
 *
 * "Forgot password" is drawn as text and does nothing. A link that leads to a
 * screen this build does not have is worse than no link, so it is visibly
 * present for design review and plainly inert until the reset flow exists.
 */
export function AuthPasswordScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit = username.trim().length > 0 && password.length > 0;

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the username and password you set up."
      footer={
        <Button
          label="Sign in with a phone number instead"
          variant="ghost"
          size="md"
          onPress={() => router.replace("/auth/phone")}
        />
      }
    >
      <TextField
        label="Username"
        value={username}
        onChangeText={setUsername}
        placeholder="yourname"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
      />

      <View>
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
        />
        <Text variant="caption" tone="tertiary" style={styles.forgot}>
          Forgot password?
        </Text>
      </View>

      <Button
        label="Sign in"
        block
        disabled={!canSubmit}
        onPress={() => router.replace("/")}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  forgot: {
    marginTop: spacing.sm,
  },
});
