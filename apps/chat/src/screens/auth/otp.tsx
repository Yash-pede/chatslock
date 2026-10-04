import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthShell, Button, CodeInput, Text } from "@chatslock/ui";

/** Digits in the code. Fixed by the backend contract, not by taste. */
const CODE_LENGTH = 6;

/**
 * The code step of phone sign-in.
 *
 * The resend countdown is a literal, not a timer: a live countdown means a
 * `setInterval` that has to be torn down when the screen unmounts mid-tick, and
 * this build has nothing to resend to. The string is where the timer will go.
 *
 * The number the code went to arrives as a route param so the subtitle can name
 * it. A missing param falls back to a generic line rather than printing
 * "undefined" at the user.
 */
export function AuthOtpScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const [code, setCode] = useState("");

  const complete = code.length === CODE_LENGTH;

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
      />

      <Button
        label="Verify"
        block
        disabled={!complete}
        onPress={() => router.replace("/")}
      />
    </AuthShell>
  );
}
