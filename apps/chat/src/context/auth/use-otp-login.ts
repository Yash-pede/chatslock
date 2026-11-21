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

/**
 * Phone/OTP sign-in state.
 *
 * `challenge` is the single source of truth for the step: no challenge → phone
 * form, challenge → code form. Sending waits for the API before moving on, so a
 * failed request never leaves the user on a code screen with no live challenge.
 */
export function useOtpLogin() {
  const { requestCode, verifyCode, auth } = useAuth()
  const { toast } = useToast()
  const authError = auth.status === "signedOut" ? auth.error : null

  const [phone, setPhone] = useState("+91")
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  /** Phone the live challenge was requested for; shown on the code form. */
  const [otpPhone, setOtpPhone] = useState<string | null>(null)
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  /** Exactly one async activity at a time. */
  const [activity, setActivity] = useState<"idle" | "requesting" | "verifying">("idle")
  const verifying = activity === "verifying"
  /** Invalidates a request that resolves after the number was changed/reset. */
  const requestSeq = useRef(0)
  /** Synchronous guard so a double submit cannot start two requests. */
  const requestingRef = useRef(false)

  const phoneValid = useMemo(() => isValidPhone(phone), [phone])
  const step: OtpStep = challenge ? "otp" : "phone"

  const backToPhone = () => {
    requestSeq.current += 1
    setChallenge(null)
    setOtpPhone(null)
    setOtp("")
    setError(null)
  }

  const sendCode = async () => {
    setError(null)

    if (!phoneValid) {
      const hint = `Enter a ${PHONE_DIGITS}-digit phone number.`
      setError(hint)
      throw new Error(hint)
    }
    if (requestingRef.current) return

    const current = ++requestSeq.current
    const requestedPhone = phone
    requestingRef.current = true
    setActivity("requesting")

    try {
      const next = await requestCode(requestedPhone)
      if (current !== requestSeq.current) return

      setChallenge(next)
      setOtpPhone(requestedPhone)
      setOtp("")
      setError(null)
    } catch (e) {
      if (current !== requestSeq.current) return

      const description = message(e, `We couldn't send a code to ${requestedPhone}.`)
      setError(description)
      toast({
        title: "Couldn't send the code",
        description,
        variant: "destructive",
      })
      // `contract` on the send button returns it to idle instead of success.
      throw e
    } finally {
      requestingRef.current = false
      setActivity((value) => (value === "requesting" ? "idle" : value))
    }
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

      // A wrong/expired code cannot be retried against this challenge.
      if ("answerCorrect" in result) {
        toast({
          title: "Couldn't verify",
          description: result.message || "Incorrect code.",
          variant: "destructive",
        })
        backToPhone()
      }
      // Valid code: AuthContext has adopted the session; the root navigator
      // reacts to the auth/profile flow, so there is no screen-level redirect.
    } catch (e) {
      toast({
        title: "Couldn't verify",
        description: message(e, "Could not verify the code."),
        variant: "destructive",
      })
      backToPhone()
    } finally {
      setActivity((value) => (value === "verifying" ? "idle" : value))
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
    otpPhone: otpPhone ?? phone,
    otp,
    error: error ?? authError,
    verifying,
    phoneValid,
    sendCode,
    verify,
    changeNumber: backToPhone,
  }
}
