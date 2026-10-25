import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  authEvents,
  logout as revokeSession,
  silentAuthService,
  tokenRefreshService,
  type AuthUser,
  type OtpChallenge,
  type OtpVerifyResult,
} from "@repo/utils"
import {
  authApi,
  phoneFor,
  rememberPhone,
  signedIn,
  storedIdentity,
  type AuthState,
} from "./auth/state"

export type { AuthState }

interface AuthContextValue {
  /** Pure session state: restoring, signed out, or signed in with an identity. */
  auth: AuthState
  requestCode: (phone: string) => Promise<OtpChallenge>
  /**
   * Resolves with the tokens (session adopted), or with a retry result when the
   * code was wrong but can be retried against the returned session.
   */
  verifyCode: (params: { otp: string; username: string; session: string }) => Promise<OtpVerifyResult>
  /** Phone number the session belongs to (needed by onboarding). */
  phone: string | null
  signInAsAgent: (params: { username: string; password: string }) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Owns the device session and nothing else. No `/me` call happens here: whether
 * the account needs onboarding is a profile concern (see `ProfileProvider`).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "restoring" })

  const signOutLocally = useCallback((error: string | null) => {
    tokenRefreshService.stopAutoRefresh()
    setAuth({ status: "signedOut", error })
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const silent = await silentAuthService.attemptSilentAuth()
      if (cancelled) return

      const identity = silent.isAuthenticated ? storedIdentity() : null
      if (identity) {
        setAuth(signedIn(identity))
      } else {
        setAuth({ status: "signedOut", error: silent.error })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // The API layer clears its tokens when a refresh is rejected; mirror it.
    return authEvents.onLogout(() => signOutLocally(null))
  }, [signOutLocally])

  /** Shared tail of both sign-in flows: tokens now exist, so the session does. */
  const adoptSession = useCallback(() => {
    const identity = storedIdentity()
    if (!identity) {
      throw new Error("Sign-in did not produce a session. Please try again.")
    }
    setAuth(signedIn(identity))
  }, [])

  const requestCode = useCallback(async (phone: string) => {
    const challenge = await authApi.requestCode(phone)
    // Kept for onboarding: the profile row is created from this number.
    rememberPhone(phone)
    return challenge
  }, [])

  const verifyCode = useCallback(
    async (params: { otp: string; username: string; session: string }) => {
      const result = await authApi.verifyCode(params)
      if ("answerCorrect" in result) return result
      adoptSession()
      return result
    },
    [adoptSession],
  )

  const signInAsAgent = useCallback(
    async (params: { username: string; password: string }) => {
      await authApi.signInAsAgent(params)
      adoptSession()
    },
    [adoptSession],
  )

  const signOut = useCallback(async () => {
    rememberPhone(null)
    await revokeSession()
    signOutLocally(null)
  }, [signOutLocally])

  const phone = auth.status === "signedIn" ? phoneFor(auth.identity) : null

  const value = useMemo<AuthContextValue>(
    () => ({ auth, phone, requestCode, verifyCode, signInAsAgent, signOut }),
    [auth, phone, requestCode, verifyCode, signInAsAgent, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>")
  }
  return context
}

/** The signed-in identity, or `null`. Convenience for screens that only need it. */
export function useIdentity(): AuthUser | null {
  const { auth } = useAuth()
  return auth.status === "signedIn" ? auth.identity : null
}
