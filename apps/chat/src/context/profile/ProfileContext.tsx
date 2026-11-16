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
import NetInfo from "@react-native-community/netinfo"
import { usersApi, type OnboardingForm, type Profile } from "@/api/users.api"
import { cacheSelfProfile, getCachedSelfProfile, useLocalDb } from "@/db"
import {
  clearPendingAgent,
  loadPendingAgent,
  readInstallReferrerAgentOnce,
  savePendingAgent,
} from "@/lib/pending-agent"
import { useNetworkStatus } from "@/lib/use-network-status"
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
  /** Invite username from a shared link (`/u/<username>`) or Play referrer. */
  pendingAgentId: string | null
  setPendingAgentId: (agentUsername: string | null) => void
  /** Drops the session locally *and* clears the profile. */
  reset: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

/** Cached profile is shown if `/me` has not answered within this window. */
const PROFILE_CACHE_TIMEOUT_MS = 4_000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { auth, phone, signOut } = useAuth()
  const { db } = useLocalDb()
  const { status: networkStatus } = useNetworkStatus()
  const signedIn = auth.status === "signedIn"
  const identity = auth.status === "signedIn" ? auth.identity : null
  const staff = identity !== null && identity.groups.length > 0

  /** Identifies the session the current `/me` state belongs to. */
  const sessionKey = identity ? `${identity.id}:${identity.username ?? ""}` : null

  const [profile, setProfile] = useState<ProfileState>({ status: "idle" })
  const [staffResolved, setStaffResolved] = useState(false)
  const [pendingAgentId, setPendingAgentIdState] = useState<string | null>(null)
  const pendingAgentRef = useRef<string | null>(null)
  const inFlight = useRef(0)

  /** Persists the invite username until onboarding consumes it. */
  const setPendingAgentId = useCallback((agentUsername: string | null) => {
    pendingAgentRef.current = agentUsername
    setPendingAgentIdState(agentUsername)
    if (agentUsername) void savePendingAgent(agentUsername)
    else void clearPendingAgent()
  }, [])

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

  // Load a persisted invite or the Play referrer, unless the user is already
  // onboarded. Clearing stored state when ready prevents stale invites.
  useEffect(() => {
    if (flow === "ready") return

    let cancelled = false

    void (async () => {
      // A `/u/<username>` link may have already set this during this launch.
      if (pendingAgentRef.current) return

      const [stored, referred] = await Promise.all([
        loadPendingAgent(),
        readInstallReferrerAgentOnce(),
      ])
      if (cancelled || pendingAgentRef.current) return

      const next = stored ?? referred
      if (!next) return

      pendingAgentRef.current = next
      setPendingAgentIdState(next)
      if (!stored) void savePendingAgent(next)
    })()

    return () => {
      cancelled = true
    }
  }, [flow])

  /** Loads `/me` for the current session; `null` when it no longer applies. */
  const fetchProfile = useCallback(async (): Promise<ProfileState | null> => {
    const request = ++inFlight.current
    const key = sessionKey
    const userId = identity?.id ?? null

    // A cached `/me` is enough to open the app offline; the network path below
    // still runs as soon as connectivity returns.
    const net = await NetInfo.fetch().catch(() => null)
    const offline = net?.isConnected === false || net?.isInternetReachable === false
    const cached = userId
      ? await getCachedSelfProfile(db, userId).catch((error) => {
          console.warn("[db] failed to read cached profile", error)
          return null
        })
      : null

    if (offline) {
      if (request !== inFlight.current || key !== sessionKey) return null
      return cached
        ? { status: "ready", profile: cached }
        : {
            status: "error",
            message: "You're offline. Connect to the internet to finish setting up your account.",
          }
    }

    let next: ProfileState | null
    if (cached) {
      // A connected-but-unreachable network can take 30s to fail; don't keep
      // the cached app behind the splash for that long.
      next = await Promise.race([
        loadProfile(),
        delay(PROFILE_CACHE_TIMEOUT_MS).then(() => null),
      ])
      if (!next) {
        if (request !== inFlight.current || key !== sessionKey) return null
        return { status: "ready", profile: cached }
      }
    } else {
      next = await loadProfile()
    }
    if (!next) return null

    // A late result from a previous session must not be applied to this one.
    if (request !== inFlight.current || key !== sessionKey) return null

    if (next.status === "ready") {
      await cacheSelfProfile(db, next.profile).catch((error) => {
        console.warn("[db] failed to cache own profile", error)
      })
      return next
    }

    // A transport failure should not hide an account we already know about.
    if (next.status === "error" && cached) return { status: "ready", profile: cached }
    return next
  }, [db, identity, sessionKey])

  /** Applies a `/me` result to state, dropping the session when refused. */
  const applyProfile = useCallback(
    async (next: ProfileState | null) => {
      if (!next) return null

      logProfile("state", { status: next.status })
      setProfile(next)
      if (staff) setStaffResolved(true)

      // Already onboarded: a stored invite is stale.
      if (next.status === "ready" && pendingAgentRef.current) setPendingAgentId(null)

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
    [staff, signOut, setPendingAgentId],
  )

  useEffect(() => {
    if (!signedIn || sessionKey === null) {
      inFlight.current++
      return
    }
    void fetchProfile()
      .then(applyProfile)
      .catch((error) => {
        console.warn("[profile] load failed", error)
      })
  }, [signedIn, sessionKey, fetchProfile, applyProfile, networkStatus])

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
      const agentUsername = pendingAgentId ?? undefined
      await usersApi.onboard({
        fullName,
        username,
        phone,
        ...(agentUsername ? { agentUsername } : {}),
      })
      setPendingAgentId(null)
      const next = await applyProfile(await fetchProfile())
      // The row exists now; anything other than `ready` would strand the user.
      if (!next || next.status === "missing") {
        throw new Error("Your profile was not saved. Please try again.")
      }
    },
    [pendingAgentId, phone, fetchProfile, applyProfile, setPendingAgentId],
  )

  const reset = useCallback(async () => {
    setPendingAgentId(null)
    setProfile({ status: "idle" })
    setStaffResolved(false)
    await signOut()
  }, [signOut, setPendingAgentId])

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
    [flow, signedIn, profile, reload, completeOnboarding, pendingAgentId, setPendingAgentId, reset],
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
