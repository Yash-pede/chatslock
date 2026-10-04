import { useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
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
} from "@chatslock/ui";

/**
 * Phone number entry — the primary sign-in method.
 *
 * The country code is a rendered affordance, not a picker: this build has no
 * country list behind it, so tapping it must not pretend to open one. The
 * number stays in local state and travels to the next screen as a route param,
 * because the OTP screen has to be able to show what the code was sent to.
 *
 * Nothing is sent anywhere. Submit just moves forward.
 */
export function AuthPhoneScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [phone, setPhone] = useState("");

  const trimmed = phone.trim();

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
            onChangeText={setPhone}
            placeholder="98765 43210"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={12}
          />
        </View>
      </View>

      <Button
        label="Send code"
        block
        disabled={trimmed.length === 0}
        onPress={() =>
          router.push({
            pathname: "/auth/otp",
            params: { phone: trimmed },
          })
        }
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
