import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import {
  Alert,
  AlertDescription,
  InputOtp,
  Label,
  PhoneInput,
  SaveButton,
  Text,
  useThemeColors,
} from "@repo/ui";
import { AlertCircle } from "lucide-react-native";
import type { OtpChallenge } from "@repo/utils";
import { useAuth } from "@/auth/AuthContext";
import { AuthScreen } from "@/auth/components/auth-screen";

const RESEND_COOLDOWN_SECONDS = 30;
const PHONE_DIGITS = 10;
// Boxes sit in a row with an "equal" gap, so the digit width scales with the
// screen instead of overflowing on small phones.
const OTP_DIGIT_HEIGHT = 58;

/**
 * Strip the dial code and separators so we can validate the local number.
 * India is the only supported market, so the prefix is matched literally:
 * a greedy `/^\+\d{1,3}/` would also eat the first digit of `+9198...`.
 */
function localNumber(fullPhone: string): string {
  return fullPhone.replace(/^\+91/, "").replace(/\D/g, "");
}

function isPhoneValid(phone: string): boolean {
  return new RegExp(`^\\d{${PHONE_DIGITS}}$`).test(localNumber(phone));
}

/**
 * User sign-in with a phone number: request an SMS code, then exchange it for a
 * session. Users are created in Cognito on first request and onboarded later.
 */
export default function UserLoginScreen() {
  const { requestCode, submitCode, error: authError } = useAuth();
  const colors = useThemeColors();

  const [phone, setPhone] = useState("+91");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [attemptedSend, setAttemptedSend] = useState(false);

  const phoneValid = useMemo(() => isPhoneValid(phone), [phone]);
  const otpValid = otp.length === 6;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  const sendCode = async () => {
    setAttemptedSend(true);
    setError(null);

    if (!phoneValid) {
      setError(`Enter a ${PHONE_DIGITS}-digit phone number.`);
      return;
    }

    try {
      const next = await requestCode(phone);
      setChallenge(next);
      setOtp("");
      setError(null);
      setAttemptedSend(false);
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code.");
      throw e;
    }
  };

  const verify = async () => {
    if (!challenge || !otpValid) return;

    try {
      await submitCode({ otp, username: challenge.username, session: challenge.session });
      // The provider flips the route once the profile has loaded.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code.");
      throw e;
    }
  };

  if (!challenge) {
    return (
      <AuthScreen
        back
        title="Sign in with phone"
        subtitle="We'll text you a 6-digit verification code."
        footer={
          <View className="items-center gap-1 pb-2">
            <Text variant="muted">Signing in as an agent instead?</Text>
            <Pressable
              onPress={() => router.replace("/login/agent")}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text variant="small" className="text-primary">
                Agent sign-in
              </Text>
            </Pressable>
          </View>
        }
      >
        <View className="gap-2">
          <Label>Phone number</Label>
          <PhoneInput
            value={phone}
            onChangeText={(next) => {
              setPhone(next);
              setError(null);
            }}
            defaultCountry="IN"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="done"
            onSubmitEditing={() => void sendCode()}
            accessibilityLabel="Phone number"
            />
          {attemptedSend && !phoneValid ? (
            <Text variant="small" className="text-destructive">
              Enter a {PHONE_DIGITS}-digit phone number.
            </Text>
          ) : null}
        </View>

        {error ? (
          <Alert variant="destructive" className="flex-row items-center gap-2 rounded-xl py-3">
            <AlertCircle size={16} color={colors.destructive} />
            <AlertDescription className="flex-1">{error}</AlertDescription>
          </Alert>
        ) : null}

        <View className="items-center">
          <SaveButton
            label="Send code"
            savedLabel="Code sent"
            onSave={sendCode}
            resetAfter={1200}
            contract
            className="min-w-40"
          />
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      back="/login/user"
      title="Enter your code"
      subtitle={`We sent a 6-digit code to ${phone}.`}
      footer={
        <View className="items-center gap-2">
          <View className="flex-row items-center gap-1.5">
            <Text variant="muted">{"Didn't get the code?"}</Text>
            <Pressable
              disabled={resendIn > 0}
              onPress={() => void sendCode()}
              accessibilityRole="button"
              accessibilityState={{ disabled: resendIn > 0 }}
              hitSlop={8}
            >
              <Text
                variant="small"
                className={resendIn > 0 ? "text-muted-foreground" : "text-primary"}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend"}
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              setChallenge(null);
              setError(null);
              setOtp("");
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text variant="small" className="text-primary">
              Change number
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="items-center">
        <InputOtp
          value={otp}
          onValueChange={(next) => {
            setOtp(next);
            setError(null);
          }}
          digitHeight={OTP_DIGIT_HEIGHT}
          autoFocus
          className="w-full items-center justify-center"
        />
      </View>

      {error ? (
        <Alert variant="destructive" className="flex-row items-center gap-2 rounded-xl py-3">
          <AlertCircle size={16} color={colors.destructive} />
          <AlertDescription className="flex-1">{error}</AlertDescription>
        </Alert>
      ) : null}

      <View className="items-center">
        <SaveButton
          label="Verify"
          savedLabel="Signed in"
          onSave={verify}
          minLoading={600}
          disabled={!otpValid}
          contract
          className="min-w-40"
        />
      </View>
    </AuthScreen>
  );
}
