import { useEffect, useMemo, useState } from "react"
import { router } from "expo-router"
import { Pressable, View } from "react-native"
import { InputOtp, Label, PhoneInput, SaveButton, Text } from "@repo/ui"
import type { OtpChallenge } from "@repo/utils"
import { useAuth } from "@/context/AuthContext"
import { AuthScreen } from "@/components/auth-screen"

const RESEND_COOLDOWN_SECONDS = 30
const PHONE_DIGITS = 10
const OTP_DIGIT_HEIGHT = 58
const SEND_TRANSITION_DELAY_MS = 500

function localNumber(fullPhone: string): string {
  return fullPhone.replace(/^\+91/, "").replace(/\D/g, "")
}

function isPhoneValid(phone: string): boolean {
  return new RegExp(`^\\d{${PHONE_DIGITS}}$`).test(localNumber(phone))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function UserLoginScreen() {
  const { requestCode, submitCode, error: authError } = useAuth()

  const [phone, setPhone] = useState("+91")
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const [attemptedSend, setAttemptedSend] = useState(false)
  const [step, setStep] = useState<"phone" | "otp">("phone")
  const [requesting, setRequesting] = useState(false)

  const phoneValid = useMemo(() => isPhoneValid(phone), [phone])
  const otpValid = otp.length === 6
  const phoneHint = `Enter a ${PHONE_DIGITS}-digit phone number.`
  const shownError = error ?? authError
  const requestDone = challenge !== null
  const canSend = phoneValid && !requesting
  const canVerify = otpValid && requestDone && !requesting

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const requestOtp = async () => {
    setRequesting(true)
    try {
      const next = await requestCode(phone)
      setChallenge(next)
      setError(null)
      setResendIn(RESEND_COOLDOWN_SECONDS)
    } catch (e) {
      setChallenge(null)
      setOtp("")
      setStep("phone")
      setAttemptedSend(false)
      setError(errorMessage(e, `We couldn't send a code to ${phone}. Try again in a moment.`))
    } finally {
      setRequesting(false)
    }
  }

  const handleSendCode = async () => {
    setAttemptedSend(true)
    setError(null)

    if (!phoneValid) {
      setError(phoneHint)
      throw new Error(phoneHint)
    }

    setOtp("")
    setChallenge(null)

    const request = requestOtp()
    await delay(SEND_TRANSITION_DELAY_MS)
    setStep("otp")
    await request
  }

  const handleResend = async () => {
    if (resendIn > 0 || requesting) return
    setError(null)
    await requestOtp()
  }

  const handleVerify = async () => {
    if (!challenge || !otpValid) {
      throw new Error("Enter the 6-digit code to continue.")
    }

    try {
      await submitCode({ otp, username: challenge.username, session: challenge.session })
    } catch (e) {
      setError(errorMessage(e, "Could not verify the code."))
      throw e
    }
  }

  const handleChangeNumber = () => {
    setStep("phone")
    setChallenge(null)
    setError(null)
    setOtp("")
  }

  if (step === "phone") {
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
              setPhone(next)
              setError(null)
            }}
            defaultCountry="IN"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (canSend) void handleSendCode().catch(() => {})
              else setAttemptedSend(true)
            }}
            accessibilityLabel="Phone number"
          />
          {shownError ? (
            <Text variant="small" className="text-destructive">
              {shownError}
            </Text>
          ) : attemptedSend && !phoneValid ? (
            <Text variant="small" className="text-destructive">
              {phoneHint}
            </Text>
          ) : null}
        </View>

        <View className="items-center">
          <SaveButton
            label="Send code"
            savedLabel="Code sent"
            onSave={handleSendCode}
            minLoading={SEND_TRANSITION_DELAY_MS}
            resetAfter={0}
            disabled={!canSend}
            contract
            className="min-w-40"
          />
        </View>
      </AuthScreen>
    )
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
              disabled={resendIn > 0 || requesting}
              onPress={() => void handleResend()}
              accessibilityRole="button"
              accessibilityState={{ disabled: resendIn > 0 || requesting }}
              hitSlop={8}
            >
              <Text
                variant="small"
                className={resendIn > 0 || requesting ? "text-muted-foreground" : "text-primary"}
              >
                {requesting ? "Sending…" : resendIn > 0 ? `Resend in ${resendIn}s` : "Resend"}
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={handleChangeNumber} accessibilityRole="button" hitSlop={8}>
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
            setOtp(next)
            setError(null)
          }}
          digitHeight={OTP_DIGIT_HEIGHT}
          autoFocus
          className="w-full items-center justify-center"
        />
      </View>

      {error ? (
        <Text variant="small" className="text-center text-destructive">
          {error}
        </Text>
      ) : null}

      <View className="items-center">
        <SaveButton
          label="Verify"
          savedLabel="Signed in"
          onSave={handleVerify}
          minLoading={600}
          disabled={!canVerify}
          contract
          className="min-w-40"
        />
      </View>
    </AuthScreen>
  )
}
