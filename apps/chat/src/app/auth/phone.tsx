import {useState} from "react";
import {useRouter} from "expo-router";
import {StyleSheet, View} from "react-native";
import {
    AuthShell,
    Button,
    Text,
    TextField,
    radius,
    sizing,
    spacing,
    type,
    useTheme,
} from "@repo/ui";
import {useAuth} from "@/utils/AuthContext";
import {extractErrorMessage} from "@repo/utils/auth";

/**
 * Route `/auth/phone` — phone number entry, the primary sign-in method.
 *
 * The country code is a rendered affordance, not a picker: this build has no
 * country list behind it, so tapping it must not pretend to open one. The
 * number travels to the OTP screen as a route param alongside the Cognito
 * session, because the verify step needs all three.
 */
export default function AuthPhoneScreen() {
    const router = useRouter();
    const {colors} = useTheme();
    const {requestOtp} = useAuth();
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmed = phone.trim();

    const handleSend = async () => {
        setError(null);
        setLoading(true);
        try {
            const challenge = await requestOtp(trimmed);
            router.push({
                pathname: "/auth/otp",
                params: {
                    phone: trimmed,
                    username: challenge.username,
                    session: challenge.session,
                },
            });
        } catch (e) {
            setError(extractErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title="Enter your phone"
            subtitle="We'll text you a six-digit code to confirm it's you."
            footer={
                <Button
                    label="Use a username and password instead"
                    variant="ghost"
                    size="md"
                    onPress={() => router.replace("/auth/password")}
                />
            }
        >
            <View style={styles.row}>
                <View
                    style={[
                        styles.country,
                        {
                            borderColor: colors.input,
                            borderRadius: radius.md,
                            // Drops past the field's label so the two controls share a
                            // baseline. Measured off the caption ramp plus the field's own
                            // label gap rather than a guessed offset.
                            marginTop: type.caption.lineHeight + spacing.xs,
                        },
                    ]}
                >
                    <Text variant="headline" tone="secondary">
                        +91
                    </Text>
                </View>

                <View style={styles.field}>
                    <TextField
                        label="Phone number"
                        value={phone}
                        onChangeText={(value) => setPhone(value.replace(/\D/g, ""))}
                        placeholder="9876543210"
                        keyboardType="number-pad"
                        inputMode="numeric"
                        autoComplete="tel"
                        textContentType="telephoneNumber"
                        maxLength={10}
                        editable={!loading}
                        error={error ?? undefined}
                    />
                </View>
            </View>

            <Button
                label="Send code"
                block
                disabled={trimmed.length === 0}
                loading={loading}
                loadingLabel="Sending"
                onPress={handleSend}
            />
        </AuthShell>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.sm,
    },
    country: {
        // Same height, radius and hairline as the field beside it, so the two
        // read as one control split in two rather than a button next to an
        // input. The label above it is the only thing that does not line up,
        // which is why the country block is nudged up by the label's height.
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
        borderWidth: StyleSheet.hairlineWidth * 2,
        minHeight: sizing.fieldHeight,
    },
    field: {
        flex: 1,
    },
});
