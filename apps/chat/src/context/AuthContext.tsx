import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  authEvents,
  extractErrorMessage,
  loginAsAgent,
  logout as revokeSession,
  requestOtp,
  silentAuthService,
  tokenManager,
  tokenRefreshService,
  verifyOtp as verifyOtpCode,
  type AuthUser,
  type OtpChallenge,
} from "@repo/utils"
import { isMissingProfile, usersApi, type OnboardingInput, type Profile } from "@/api/users.api"
import "@/lib/api"

/** Re-exported so screens keep importing the profile type from the auth module. */
export type { Profile }

/** Steps a signed-in user can be in before they reach the main app. */
export type AuthPhase =
  | "loading"
  | "unauthenticated"
  | "onboarding"
  /**
   * The session exists but `GET /api/users/me` did not confirm it. The user is
   * NOT treated as signed in: they see a retry screen first.
   */
  | "unverified"
  | "ready"

/** What `GET /api/users/me` gave us for the current session. */
type ProfileState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: Profile }
  | { status: "missing" }
  | { status: "error"; message: string }

interface AuthContextValue {
  phase: AuthPhase
  /** Full profile from `GET /api/users/me`; `null` until it has been fetched. */
  user: Profile | null
  /** Identity decoded from the ID token — useful before the profile loads. */
  identity: AuthUser | null
  isProfileLoading: boolean
  /** Non-fatal profile refresh error (a failed refresh never signs you out). */
  error: string | null

  requestCode: (phone: string) => Promise<OtpChallenge>
  submitCode: (params: { otp: string; username: string; session: string }) => Promise<void>
  signInAsAgent: (params: { username: string; password: string }) => Promise<void>
  /** Creates the profile row for a signed-in session that has none yet. */
  completeOnboarding: (params: OnboardingInput) => Promise<void>
  /**
   * Agent from a shared profile link (`chatslock.com/u/<agentId>`), carried from
   * the signed-out screens through onboarding so the profile is linked to them.
   */
  pendingAgentId: string | null
  setPendingAgentId: (agentId: string | null) => void
  reloadProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Detach the session locally when the server would not confirm the profile. */
async function discardSession(): Promise<void> {
  tokenRefreshService.stopAutoRefresh()
  await tokenManager.clearAllTokens()
}

/**
 * Loads the profile for an existing session. Returns the profile state so the
 * caller (startup restore or a fresh login) decides how fatal a failure is.
 */
async function fetchProfileState(): Promise<ProfileState> {
  try {
    return { status: "ready", data: await usersApi.getMe() }
  } catch (e) {
    if (isMissingProfile(e)) return { status: "missing" }
    return { status: "error", message: extractErrorMessage(e) }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>("loading")
  /** Ref mirror of `phase` so callbacks stay stable without re-creating on phase. */
  const phaseRef = useRef<AuthPhase>("loading")
  const [profile, setProfile] = useState<ProfileState>({ status: "idle" })
  const [identity, setIdentity] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null)

  /**
   * Startup path: tokens were already on the device. A failed `/me` is
   * recoverable, so the session is kept and the user gets a retry screen
   * instead of the app (or being silently signed out).
   */
  const restoreSession = useCallback(async () => {
    if (!tokenManager.getUser()) return

    setIdentity(tokenManager.getUser())
    const next = await fetchProfileState()
    setProfile(next)

    if (next.status === "ready") {
      tokenRefreshService.startAutoRefresh()
      setPhase("ready")
      setError(null)
    } else if (next.status === "missing") {
      tokenRefreshService.startAutoRefresh()
      setPhase("onboarding")
      setError(null)
    } else {
      // Do not open the app on an unconfirmed session — let the user retry.
      setPhase("unverified")
      setError(next.status === "error" ? next.message : null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const state = await silentAuthService.attemptSilentAuth()
      if (cancelled) return

      if (!state.isAuthenticated) {
        setIdentity(null)
        setProfile({ status: "idle" })
        setError(state.error)
        setPhase("unauthenticated")
        return
      }

      await restoreSession()
    })()

    return () => {
      cancelled = true
    }
  }, [restoreSession])

  useEffect(() => {
    return authEvents.onLogout(() => {
      tokenRefreshService.stopAutoRefresh()
      setIdentity(null)
      setProfile({ status: "idle" })
      setError(null)
      setPhase("unauthenticated")
    })
  }, [])

  /**
   * Runs immediately after a successful credential exchange. The profile is
   * part of the session: if it cannot be loaded (other than "not created yet"),
   * the tokens are discarded and the login is reported as failed.
   */
  const completeLogin = useCallback(async () => {
    setProfile({ status: "loading" })

    const next = await fetchProfileState()

    if (next.status === "error") {
      await discardSession()
      setIdentity(null)
      setProfile({ status: "idle" })
      setPhase("unauthenticated")
      setError(next.message)
      throw new Error(next.message)
    }

    tokenRefreshService.startAutoRefresh()
    setIdentity(tokenManager.getUser())
    setProfile(next)
    setError(null)
    setPhase(next.status === "ready" ? "ready" : "onboarding")
  }, [])

  const requestCode = useCallback((phone: string) => requestOtp(phone), [])

  const submitCode = useCallback(
    async (params: { otp: string; username: string; session: string }) => {
      setError(null)
      await verifyOtpCode(params)
      await completeLogin()
    },
    [completeLogin],
  )

  const signInAsAgent = useCallback(
    async ({ username, password }: { username: string; password: string }) => {
      setError(null)
      await loginAsAgent({ username, password })
      await completeLogin()
    },
    [completeLogin],
  )

  /** Re-reads `/me` without discarding the session. */
  const reloadProfile = useCallback(async () => {
    setError(null)
    setProfile((current) => (current.status === "ready" ? current : { status: "loading" }))
    // Retrying from the unverified screen goes back to the loading splash.
    if (phaseRef.current === "unverified") setPhase("loading")

    const next = await fetchProfileState()
    setProfile(next)

    if (next.status === "ready") {
      tokenRefreshService.startAutoRefresh()
      setPhase("ready")
      setError(null)
    } else if (next.status === "missing") {
      setPhase("onboarding")
      setError(null)
    } else if (next.status === "error") {
      setPhase("unverified")
      setError(next.message)
    }
  }, [])

  /**
   * Creates the missing profile through `POST /api/users/onboarding`, attaching
   * the agent from a shared link when there is one, then re-reads `/me` so the
   * phase only flips to `ready` once the profile actually exists.
   */
  const completeOnboarding = useCallback(
    async ({ fullName, username }: OnboardingInput) => {
      setError(null)
      const agentId = pendingAgentId ?? undefined

      await usersApi.onboard({
        fullName,
        username,
        ...(agentId ? { agentId } : {}),
      })

      setPendingAgentId(null)
      await reloadProfile()
    },
    [pendingAgentId, reloadProfile],
  )

  const signOut = useCallback(async () => {
    await revokeSession()
    tokenRefreshService.stopAutoRefresh()
    setIdentity(null)
    setProfile({ status: "idle" })
    setError(null)
    setPendingAgentId(null)
    setPhase("unauthenticated")
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      phase,
      user: profile.status === "ready" ? profile.data : null,
      identity,
      isProfileLoading: profile.status === "loading",
      error,
      requestCode,
      submitCode,
      signInAsAgent,
      completeOnboarding,
      pendingAgentId,
      setPendingAgentId,
      reloadProfile,
      signOut,
    }),
    [
      phase,
      profile,
      identity,
      error,
      requestCode,
      submitCode,
      signInAsAgent,
      completeOnboarding,
      pendingAgentId,
      reloadProfile,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Auth actions and state. Use `useUser()` for the profile alone. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>")
  }
  return context
}

/** The signed-in user's profile from `GET /api/users/me`, safe to call anywhere. */
export function useUser(): {
  user: Profile | null
  isLoading: boolean
  error: string | null
  reload: () => Promise<void>
} {
  const { user, isProfileLoading, error, reloadProfile } = useAuth()
  return { user, isLoading: isProfileLoading, error, reload: reloadProfile }
}
