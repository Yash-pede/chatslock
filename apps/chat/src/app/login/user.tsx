import { router } from "expo-router"
import { Pressable, View } from "react-native"
import { InputOtp, Label, PhoneInput, SaveButton, Text } from "@repo/ui"
import { AuthScreen } from "@/components/auth-screen"
import { useOtpLogin } from "@/context/auth/use-otp-login"

const OTP_DIGIT_HEIGHT = 58

function SwitchFlowLink({
  to,
  prompt,
  action,
}: {
  to: "/login/agent" | "/login/user"
  prompt: string
  action: string
}) {
  return (
    <View className="items-center gap-1 pb-2">
      <Text variant="muted">{prompt}</Text>
      <Pressable onPress={() => router.replace(to)} accessibilityRole="button" hitSlop={8}>
        <Text variant="small" className="text-primary">
          {action}
        </Text>
      </Pressable>
    </View>
  )
}

export default function UserLoginScreen() {
  const login = useOtpLogin()

  if (login.step === "phone") {
    return (
      <AuthScreen
        back
        title="Sign in with phone"
        subtitle="We'll text you a 6-digit verification code."
        footer={
          <SwitchFlowLink
            to="/login/agent"
            prompt="Signing in as an agent instead?"
            action="Agent sign-in"
          />
        }
      >
        <View className="gap-2">
          <Label>Phone number</Label>
          <PhoneInput
            value={login.phone}
            onChangeText={login.setPhone}
            defaultCountry="IN"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="done"
            onSubmitEditing={() => void login.sendCode().catch(() => {})}
            accessibilityLabel="Phone number"
          />
          {login.error ? (
            <Text variant="small" className="text-destructive">
              {login.error}
            </Text>
          ) : null}
        </View>

        <View className="items-center">
          <SaveButton
            label="Send code"
            savedLabel="Code sent"
            onSave={login.sendCode}
            minLoading={500}
            resetAfter={0}
            disabled={!login.phoneValid}
            contract
            className="min-w-40"
          />
        </View>
      </AuthScreen>
    )
  }

  const resendDisabled = login.resendIn > 0 || login.requesting
  // The first send runs in the background: show that the code is still on its
  // way instead of a stale "Resend in 30s".
  const requestPending = login.requesting && login.resendIn === 0
  const resendLabel = requestPending
    ? "Sending…"
    : login.resendIn > 0
      ? `Resend in ${login.resendIn}s`
      : "Resend"

  return (
    <AuthScreen
      back
      title="Enter your code"
      subtitle={
        requestPending
          ? `Sending a 6-digit code to ${login.otpPhone}…`
          : `We sent a 6-digit code to ${login.otpPhone}.`
      }
      footer={
        <View className="items-center gap-2">
          <View className="flex-row items-center gap-1.5">
            <Text variant="muted">{"Didn't get the code?"}</Text>
            <Pressable
              disabled={resendDisabled}
              onPress={() => void login.resend()}
              accessibilityRole="button"
              accessibilityState={{ disabled: resendDisabled }}
              hitSlop={8}
            >
              <Text
                variant="small"
                className={resendDisabled ? "text-muted-foreground" : "text-primary"}
              >
                {resendLabel}
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={login.changeNumber} accessibilityRole="button" hitSlop={8}>
            <Text variant="small" className="text-primary">
              Change number
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="items-center">
        <InputOtp
          key={login.attempt}
          value={login.otp}
          onValueChange={login.setOtp}
          digitHeight={OTP_DIGIT_HEIGHT}
          autoFocus
          className="w-full items-center justify-center"
          accessibilityLabel="Verification code"
        />
      </View>

      {login.error ? (
        <Text variant="small" className="text-center text-destructive">
          {login.error}
        </Text>
      ) : null}

      <View className="items-center">
        <SaveButton
          label="Verify"
          savedLabel="Signed in"
          onSave={login.verify}
          minLoading={600}
          disabled={login.otp.length !== 6 || login.verifying || login.sendingCode}
          contract
          className="min-w-40"
        />
      </View>
    </AuthScreen>
  )
}
