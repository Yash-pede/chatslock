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
            key="phone-send"
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

  return (
    <AuthScreen
      back
      title="Enter your code"
      subtitle={`We sent a 6-digit code to ${login.otpPhone}.`}
      footer={
        <View className="items-center gap-2">
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
          value={login.otp}
          onValueChange={login.setOtp}
          digitHeight={OTP_DIGIT_HEIGHT}
          autoFocus
          className="w-full items-center justify-center"
          accessibilityLabel="Verification code"
        />
      </View>

      <View className="items-center">
        <SaveButton
          key="otp-verify"
          label="Verify"
          savedLabel="Signed in"
          onSave={login.verify}
          minLoading={600}
          disabled={login.otp.length !== 6 || login.verifying}
          contract
          className="min-w-40"
        />
      </View>
    </AuthScreen>
  )
}
