import {useState} from "react";
import {useRouter} from "expo-router";
import {StyleSheet, View} from "react-native";
import {AuthShell, Button, Text, TextField, spacing} from "@repo/ui";
import {useAuth} from "@/utils/AuthContext";
import {extractErrorMessage} from "@repo/utils/auth";

/** Route `/auth/password` — username and password sign-in. */
export default function AuthPasswordRoute() {
    const router = useRouter();
    const {login} = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = username.trim().length > 0 && password.length > 0;

    const handleSignIn = async () => {
        if (loading) return;
        setError(null);
        setLoading(true);
        try {
            // Resolves only after /me: agents land on home, users without a
            // username/full name on onboarding. Stay here until then.
            const destination = await login(username.trim(), password);
            router.replace(destination);
        } catch (e) {
            setError(extractErrorMessage(e));
            setLoading(false);
        }
    };

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
                editable={!loading}
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
                    editable={!loading}
                    error={error ?? undefined}
                />
                <Text variant="caption" tone="tertiary" style={styles.forgot}>
                    Forgot password?
                </Text>
            </View>

            <Button
                label="Sign in"
                block
                disabled={!canSubmit}
                loading={loading}
                loadingLabel="Signing in"
                onPress={handleSignIn}
            />
        </AuthShell>
    );
}

const styles = StyleSheet.create({
    forgot: {
        marginTop: spacing.sm,
    },
});
