import { useEffect, useMemo, useRef, useState } from "react"
import type { OtpChallenge } from "@repo/utils"
import { useAuth } from "@/context/AuthContext"

const RESEND_COOLDOWN_SECONDS = 30
const PHONE_DIGITS = 10

export type OtpStep = "phone" | "otp"

const localDigits = (phone: string) => phone.replace(/^\+91/, "").replace(/\D/g, "")
export const isValidPhone = (phone: string) =>
  new RegExp(`^\\d{${PHONE_DIGITS}}$`).test(localDigits(phone))

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export function useOtpLogin() {
  const { requestCode, verifyCode, auth } = useAuth()
  const authError = auth.status === "signedOut" ? auth.error : null

  const [phone, setPhone] = useState("+91")
  const [step, setStep] = useState<OtpStep>("phone")
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  /** Last phone a code was requested for; the OTP step shows its own error. */
  const [pendingPhone, setPendingPhone] = useState<string | null>(null)
  /** A resend in flight from the OTP step (the first send already moved on). */
  const [sendingFromOtp, setSendingFromOtp] = useState(false)
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const [requesting, setRequesting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  /** Bumped to remount the code input at digit one after a failure. */
  const [attempt, setAttempt] = useState(0)
  /** Latest OTP request; a slow earlier response must not win. */
  const requestSeq = useRef(0)

  const phoneValid = useMemo(() => isValidPhone(phone), [phone])
  const busy = requesting || verifying

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const fail = (e: unknown, fallback: string) => {
    setError(message(e, fallback))
    setOtp("")
    setAttempt((value) => value + 1)
  }

  const requestOtp = async (): Promise<OtpChallenge | null> => {
    const current = ++requestSeq.current
    setRequesting(true)
    try {
      const next = await requestCode(phone)
      if (current !== requestSeq.current) return next
      setChallenge(next)
      setPendingPhone(null)
      setOtp("")
      setError(null)
      setResendIn(RESEND_COOLDOWN_SECONDS)
      setAttempt((value) => value + 1)
      return next
    } catch (e) {
      if (current !== requestSeq.current) throw e
      // The user is already on the OTP step (the send was fired in the
      // background), so the failure is reported there and they stay on it.
      setChallenge(null)
      setError(message(e, `We couldn't send a code to ${phone}. Tap resend to try again.`))
      throw e
    } finally {
      if (current === requestSeq.current) {
        setRequesting(false)
        setSendingFromOtp(false)
      }
    }
  }

  /**
   * Moves to the code screen immediately and requests the code in the
   * background: waiting for Cognito's challenge made the button feel stuck.
   * The challenge arrives a moment later; a failure (or the user resending)
   * is reported on the OTP step, never back on the phone step.
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

  const resend = async () => {
    if (resendIn > 0 || requesting) return
    setError(null)
    setSendingFromOtp(true)
    await requestOtp().catch(() => undefined)
  }

  const verify = async () => {
    if (!challenge) {
      throw new Error(
        requesting
          ? "Still sending your code. Try again in a moment."
          : "Request a new code to continue.",
      )
    }
    if (otp.length !== 6) throw new Error("Enter the 6-digit code to continue.")
    if (verifying) return

    setVerifying(true)
    setError(null)
    try {
      const result = await verifyCode({
        otp,
        username: challenge.username,
        session: challenge.session,
      })
      // Wrong code: keep the (possibly rotated) session and let the user retry.
      if ("answerCorrect" in result) {
        setChallenge({ ...challenge, ...(result.session ? { session: result.session } : {}) })
        fail(result.message, "Incorrect code.")
      }
    } catch (e) {
      fail(e, "Could not verify the code.")
      throw e
    } finally {
      setVerifying(false)
    }
  }

  const changeNumber = () => {
    // Invalidate an in-flight request so its result cannot reopen the OTP step.
    requestSeq.current += 1
    setStep("phone")
    setChallenge(null)
    setPendingPhone(null)
    setError(null)
    setOtp("")
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
    attempt,
    error: error ?? authError,
    resendIn,
    requesting,
    /** True while a code requested from the OTP step is in flight. */
    sendingCode: requesting && (sendingFromOtp || step === "otp"),
    verifying,
    phoneValid,
    busy,
    sendCode,
    resend,
    verify,
    changeNumber,
  }
}
