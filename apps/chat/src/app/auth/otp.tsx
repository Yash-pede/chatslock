import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthShell, Button, CodeInput, Text } from "@repo/ui";
import { useAuth } from "@/utils/AuthContext";
import { extractErrorMessage } from "@repo/utils/auth";

const CODE_LENGTH = 6;

/**
 * The code step of phone sign-in.
 *
 * The Cognito session and username arrive as route params from the phone
 * screen; without them there is nothing to verify against, so the screen falls
 * back to sending the user back rather than firing a request that cannot work.
 */
export default function AuthOtpRoute() {
  const router = useRouter();
  const { phone, username, session } = useLocalSearchParams<{
    phone?: string;
    username?: string;
    session?: string;
  }>();
  const { verifyOtp } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = code.length === CODE_LENGTH;

  const submit = async (codeToVerify: string) => {
    if (loading) return;

    // `onComplete` fires in the same tick as the last keystroke, before the
    // `code` state re-renders — so the value must come in as an argument.
    if (codeToVerify.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code.`);
      return;
    }
    if (!username || !session) {
      setError("This code has expired. Request a new one.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      // Resolves only after /me; stay on this screen until it does.
      const destination = await verifyOtp({ otp: codeToVerify, username, session });
      router.replace(destination);
    } catch (e) {
      setError(extractErrorMessage(e));
      setCode("");
      setLoading(false);
    }
  };

  return (
      <AuthShell
          title="Enter the code"
          subtitle={
            phone
                ? `We sent a ${CODE_LENGTH}-digit code to +91 ${phone}.`
                : `We sent a ${CODE_LENGTH}-digit code to your phone.`
          }
          footer={
            <>
              <Text variant="caption" tone="tertiary">
                Resend in 00:30
              </Text>
              <Button
                  label="Use a different number"
                  variant="ghost"
                  size="md"
                  onPress={() => router.replace("/auth/phone")}
              />
            </>
          }
      >
        <CodeInput
            length={CODE_LENGTH}
            value={code}
            onChangeCode={setCode}
            label="Verification code"
            disabled={loading}
            error={error ?? undefined}
            onComplete={submit}
        />

        <Button
            label="Verify"
            block
            disabled={!complete}
            loading={loading}
            loadingLabel="Verifying"
            onPress={() => submit(code)}
        />
      </AuthShell>
  );
}
