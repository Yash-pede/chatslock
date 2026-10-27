import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { discardSession, tokenRefreshService } from "@repo/utils"
import { usersApi, type OnboardingForm, type Profile } from "@/api/users.api"
import { useAuth } from "@/context/AuthContext"
import { loadProfile, logProfile, userFlowFor, type Flow, type ProfileState } from "./profile"

interface ProfileContextValue {
  /** Which screen group the app should show. Derived from the claims + `/me`. */
  flow: Flow
  /** A session exists (tokens + identity), regardless of the profile state. */
  signedIn: boolean
  /** The profile once it has loaded, otherwise `null`. */
  user: Profile | null
  isLoading: boolean
  /** Retryable `/me` failure, for the unverified gate. */
  error: string | null
  reload: () => Promise<void>
  completeOnboarding: (input: OnboardingForm) => Promise<void>
  /** Agent from a shared link (`/u/<agentId>`), used by onboarding. */
  pendingAgentId: string | null
  setPendingAgentId: (agentId: string | null) => void
  /** Drops the session locally *and* clears the profile. */
  reset: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { auth, phone, signOut } = useAuth()
  const signedIn = auth.status === "signedIn"
  const identity = auth.status === "signedIn" ? auth.identity : null
  const staff = identity !== null && identity.groups.length > 0

  /** Identifies the session the current `/me` state belongs to. */
  const sessionKey = identity ? `${identity.id}:${identity.username ?? ""}` : null

  const [profile, setProfile] = useState<ProfileState>({ status: "idle" })
  const [staffResolved, setStaffResolved] = useState(false)
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null)
  const inFlight = useRef(0)

  // Drop stale state in the same render that sees the session end or change.
  const [lastSessionKey, setLastSessionKey] = useState(sessionKey)
  if (sessionKey !== lastSessionKey) {
    setLastSessionKey(sessionKey)
    setProfile({ status: "idle" })
    setStaffResolved(false)
  }

  const flow = useMemo<Flow>(() => {
    if (auth.status === "restoring") return "loading"
    if (!identity) return "signedOut"
    if (staff) return staffResolved ? "ready" : "loading"
    return userFlowFor(profile)
  }, [auth.status, identity, staff, staffResolved, profile])

  /** Loads `/me` for the current session; `null` when it no longer applies. */
  const fetchProfile = useCallback(async (): Promise<ProfileState | null> => {
    const request = ++inFlight.current
    const key = sessionKey
    const next = await loadProfile()

    // A late result from a previous session must not be applied to this one.
    if (request !== inFlight.current || key !== sessionKey) return null
    return next
  }, [sessionKey])

  /** Applies a `/me` result to state, dropping the session when refused. */
  const applyProfile = useCallback(
    async (next: ProfileState | null) => {
      if (!next) return null

      logProfile("state", { status: next.status })
      setProfile(next)
      if (staff) setStaffResolved(true)

      if (next.status === "rejected") {
        setStaffResolved(false)
        // The server refuses this token: sign out instead of showing a gate
        // the user can never pass.
        await discardSession()
        tokenRefreshService.stopAutoRefresh()
        await signOut()
      }
      return next
    },
    [staff, signOut],
  )

  useEffect(() => {
    if (!signedIn || sessionKey === null) {
      inFlight.current++
      return
    }
    void fetchProfile().then(applyProfile)
  }, [signedIn, sessionKey, fetchProfile, applyProfile])

  const reload = useCallback(async () => {
    // Force a new attempt: the gate is showing, so `staffResolved` may have
    // been set by an earlier soft failure.
    if (staff) setStaffResolved(false)
    await applyProfile(await fetchProfile())
  }, [staff, fetchProfile, applyProfile])

  const completeOnboarding = useCallback(
    async ({ fullName, username }: OnboardingForm) => {
      if (!phone) {
        // The profile row is keyed by the verified phone; without it the row
        // would be created unusable.
        throw new Error("Your session is missing your phone number. Please sign in again.")
      }
      const agentId = pendingAgentId ?? undefined
      await usersApi.onboard({
        fullName,
        username,
        phone,
        ...(agentId ? { agentId } : {}),
      })
      setPendingAgentId(null)
      const next = await applyProfile(await fetchProfile())
      // The row exists now; anything other than `ready` would strand the user.
      if (!next || next.status === "missing") {
        throw new Error("Your profile was not saved. Please try again.")
      }
    },
    [pendingAgentId, phone, fetchProfile, applyProfile],
  )

  const reset = useCallback(async () => {
    setPendingAgentId(null)
    setProfile({ status: "idle" })
    setStaffResolved(false)
    await signOut()
  }, [signOut])

  const value = useMemo<ProfileContextValue>(
    () => ({
      flow,
      signedIn,
      user: profile.status === "ready" ? profile.profile : null,
      isLoading: flow === "loading",
      error: profile.status === "error" ? profile.message : null,
      reload,
      completeOnboarding,
      pendingAgentId,
      setPendingAgentId,
      reset,
    }),
    [flow, signedIn, profile, reload, completeOnboarding, pendingAgentId, reset],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error("useProfile must be used inside <ProfileProvider>")
  }
  return context
}

/** The signed-in user's profile, safe to call from any screen. */
export function useUser(): { user: Profile | null; isLoading: boolean; error: string | null } {
  const { user, isLoading, error } = useProfile()
  return { user, isLoading, error }
}
