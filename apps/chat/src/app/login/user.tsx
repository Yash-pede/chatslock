import { router } from "expo-router"
import { useCallback, useEffect, useRef } from "react"
import { Pressable, View } from "react-native"
import * as Application from "expo-application"
import { InputOtp, Label, PhoneInput, SaveButton, Text } from "@repo/ui"
import { AuthScreen } from "@/components/auth-screen"
import { useOtpLogin } from "@/context/auth/use-otp-login"

const OTP_DIGIT_HEIGHT = 58
const AGENT_UNLOCK_TAPS = 7
const AGENT_UNLOCK_WINDOW_MS = 3_000

/**
 * Discreet agent entry: the version label at the bottom of the phone screen.
 * Seven quick taps open `/login/agent`; nothing else in the UI mentions agents.
 */
function AgentUnlock() {
  const taps = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const handlePress = useCallback(() => {
    taps.current += 1
    clearTimer()

    if (taps.current >= AGENT_UNLOCK_TAPS) {
      taps.current = 0
      router.push("/login/agent")
      return
    }

    timer.current = setTimeout(() => {
      taps.current = 0
    }, AGENT_UNLOCK_WINDOW_MS)
  }, [clearTimer])

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="App version"
      hitSlop={12}
      className="items-center pb-2"
    >
      <Text variant="small" className="text-center text-muted-foreground">
        Chatslock {Application.nativeApplicationVersion ?? "1.0"}
      </Text>
    </Pressable>
  )
}

export default function UserLoginScreen() {
  const login = useOtpLogin()

  if (login.step === "phone") {
    return (
      <AuthScreen
        title="Sign in with phone"
        subtitle="We'll text you a 6-digit verification code."
        footer={<AgentUnlock />}
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
