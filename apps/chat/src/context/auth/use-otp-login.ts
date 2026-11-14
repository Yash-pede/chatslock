import { useMemo, useRef, useState } from "react"
import type { OtpChallenge } from "@repo/utils"
import { useToast } from "@repo/ui"
import { useAuth } from "@/context/AuthContext"

const PHONE_DIGITS = 10

export type OtpStep = "phone" | "otp"

const localDigits = (phone: string) => phone.replace(/^\+91/, "").replace(/\D/g, "")
export const isValidPhone = (phone: string) =>
  new RegExp(`^\\d{${PHONE_DIGITS}}$`).test(localDigits(phone))

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export function useOtpLogin() {
  const { requestCode, verifyCode, auth } = useAuth()
  const { toast } = useToast()
  const authError = auth.status === "signedOut" ? auth.error : null

  const [phone, setPhone] = useState("+91")
  const [step, setStep] = useState<OtpStep>("phone")
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  /** Last phone a code was requested for; the OTP step shows its own error. */
  const [pendingPhone, setPendingPhone] = useState<string | null>(null)
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  /** Exactly one async activity at a time; no overlapping booleans. */
  const [activity, setActivity] = useState<"idle" | "requesting" | "verifying">("idle")
  const requesting = activity === "requesting"
  const verifying = activity === "verifying"
  /** Latest OTP request; a slow earlier response must not win. */
  const requestSeq = useRef(0)

  const phoneValid = useMemo(() => isValidPhone(phone), [phone])
  /** Drops the challenge and returns to the number form (toast the caller). */
  const backToPhone = () => {
    requestSeq.current += 1
    setStep("phone")
    setChallenge(null)
    setPendingPhone(null)
    setError(null)
    setOtp("")
  }

  const requestOtp = async (): Promise<OtpChallenge | null> => {
    const current = ++requestSeq.current
    setActivity("requesting")
    try {
      const next = await requestCode(phone)
      if (current !== requestSeq.current) return next
      setChallenge(next)
      setPendingPhone(null)
      setOtp("")
      setError(null)
      return next
    } catch (e) {
      if (current !== requestSeq.current) throw e
      toast({
        title: "Couldn't send the code",
        description: message(e, `We couldn't send a code to ${phone}.`),
        variant: "destructive",
      })
      backToPhone()
      throw e
    } finally {
      setActivity((current) => (current === "requesting" ? "idle" : current))
    }
  }

  /**
   * Moves to the code screen immediately and requests the code in the
   * background: waiting for Cognito's challenge made the button feel stuck.
   * A failure is toasted and sends the user back to the phone step.
   */
  const sendCode = async () => {
    setError(null)
    if (!phoneValid) {
      const hint = `Enter a ${PHONE_DIGITS}-digit phone number.`
      setError(hint)
      throw new Error(hint)
    }
    if (requesting) return

    setOtp("")
    setChallenge(null)
    setPendingPhone(phone)
    setStep("otp")
    // Deliberately not awaited: the screen is already interactive.
    void requestOtp().catch(() => undefined)
  }

  const verify = async () => {
    if (!challenge) {
      toast({
        title: "Code expired",
        description: "Enter your number to get a new code.",
        variant: "destructive",
      })
      backToPhone()
      return
    }

    if (otp.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Enter the 6-digit code to continue.",
        variant: "destructive",
      })
      return
    }

    if (activity !== "idle") return

    setActivity("verifying")
    setError(null)
    try {
      const result = await verifyCode({
        otp,
        username: challenge.username,
        session: challenge.session,
      })
      // Wrong code, expired/rotated session, or any other failure: the OTP step
      // is a dead end now, so report it and go back to the number form.
      if ("answerCorrect" in result) {
        toast({
          title: "Couldn't verify",
          description: result.message || "Incorrect code.",
          variant: "destructive",
        })
        backToPhone()
      }
    } catch (e) {
      toast({
        title: "Couldn't verify",
        description: message(e, "Could not verify the code."),
        variant: "destructive",
      })
      backToPhone()
    } finally {
      setActivity((current) => (current === "verifying" ? "idle" : current))
    }
  }

  return {
    phone,
    setPhone: (next: string) => {
      setPhone(next)
      setError(null)
    },
    setOtp: (next: string) => {
      setOtp(next)
      setError(null)
    },
    step,
    /** Phone shown on the OTP step (set the moment the code was requested). */
    otpPhone: pendingPhone ?? phone,
    otp,
    error: error ?? authError,
    requesting,
    verifying,
    phoneValid,
    sendCode,
    verify,
    changeNumber: backToPhone,
  }
}
