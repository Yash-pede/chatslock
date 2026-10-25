import { extractErrorMessage, isNetworkError } from "@repo/utils"
import { isMissingProfile, usersApi, type Profile } from "@/api/users.api"

/** What `GET /api/users/me` told us about the signed-in account. */
export type ProfileState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; profile: Profile }
  /** The account exists (valid token) but has no profile row yet → onboarding. */
  | { status: "missing" }
  /** The server refuses this token (401/403): the session must be dropped. */
  | { status: "rejected" }
  /** Retryable failure (network/5xx): the session is kept. */
  | { status: "error"; message: string }

/**
 * The route group the app shows. Derived from the token claims first, then
 * from `/me` for plain users:
 * - `signedOut`: no session
 * - `onboarding`: user session, `/me` says the profile row does not exist
 * - `unverified`: session kept, `/me` failed in a way that can be retried
 * - `ready`: signed in with a usable profile
 * - `loading`: still resolving
 *
 * `signedOut` is the only flow that shows the sign-in screens.
 */
export type Flow = "loading" | "signedOut" | "onboarding" | "unverified" | "ready"

/** HTTP status of a failure, or `undefined` when the request never reached the server. */
function responseStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const { response } = error as { response?: { status?: number } }
  return typeof response?.status === "number" ? response.status : undefined
}

/** Development-only breadcrumbs; never logs tokens or profile contents. */
export function logProfile(step: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return
  console.log(`[profile] ${step}`, detail ?? "")
}

/** Attempts for a retryable `/me` failure before a gate is shown. */
const PROFILE_ATTEMPTS = 2
const PROFILE_RETRY_DELAY_MS = 600

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** One `GET /api/users/me` attempt, classified. */
async function loadProfileOnce(): Promise<ProfileState> {
  try {
    const profile = await usersApi.getMe()
    logProfile("me ok", { userId: profile.userId })
    return { status: "ready", profile }
  } catch (e) {
    const status = responseStatus(e)
    logProfile("me failed", { status, network: isNetworkError(e) })

    if (status === 404 || isMissingProfile(e)) return { status: "missing" }
    if (status === 401 || status === 403) return { status: "rejected" }
    return { status: "error", message: extractErrorMessage(e) }
  }
}

/**
 * `GET /api/users/me`, classified for routing.
 *
 * 404 (the users lambda's `NOT_FOUND` / "User not found") is checked first and
 * on purpose: it is the normal answer for a phone account that verified but
 * never finished onboarding, and it must lead to onboarding — never to a
 * dropped session (that is what 401/403 mean).
 *
 * A retryable failure (network, cold Lambda 5xx) is retried once before giving
 * up, so a transient blip cannot bounce a new user back to sign-in.
 */
export async function loadProfile(): Promise<ProfileState> {
  let result = await loadProfileOnce()

  for (let attempt = 1; attempt < PROFILE_ATTEMPTS && result.status === "error"; attempt++) {
    await wait(PROFILE_RETRY_DELAY_MS)
    result = await loadProfileOnce()
  }

  return result
}

/** `/me` flow for a signed-in plain user. */
export function userFlowFor(profile: ProfileState): Flow {
  switch (profile.status) {
    case "ready":
      return "ready"
    case "missing":
      return "onboarding"
    case "error":
    case "rejected":
      return "unverified"
    default:
      return "loading"
  }
}
