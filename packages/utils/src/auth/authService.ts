import axios from "axios"
import { getAuthApiUrl } from "../config"
import { secureStorage } from "./secureStorage"
import { tokenManager } from "./tokenManager"

/**
 * A bare axios instance for auth calls. Deliberately separate from the
 * authenticated `apiClient`: auth endpoints must not run through the 401
 * refresh interceptor (refreshing from within a refresh would recurse). The
 * base URL is resolved per request from the configured API URL.
 */
const http = axios.create({
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
})

http.interceptors.request.use((config) => {
  config.baseURL = getAuthApiUrl()
  return config
})

/** Sign-in flow that produced the session; refresh tokens are client-bound. */
export type AuthClient = "otp" | "userpass"

export interface AuthTokens {
  accessToken: string
  idToken?: string
  refreshToken?: string
  expiresIn: number
  client?: AuthClient
}

export interface OtpChallenge {
  username: string
  session: string
  challengeName: string
}

export interface ApiErrorBody {
  message?: string
  errors?: unknown
  /**
   * Envelope shape returned by the users lambda: `{ ok: false, error }`. The
   * auth lambda answers `{ success: false, message }` instead.
   */
  error?: { code?: string; message?: string }
}

/**
 * Axios reports transport problems and the HTTP status, never a reason the user
 * can act on. Those messages ("Request failed with status code 400", "Network
 * Error", …) must never reach the UI; fall back to a written explanation.
 */
function isAxiosGeneratedMessage(message: string): boolean {
  return (
    /^Request failed with status code \d+$/.test(message) ||
    /^(Network Error|timeout of \d+ms exceeded|canceled)$/i.test(message)
  )
}

/** Pull the backend's human-readable message out of an axios error. */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data

    // A JSON body: `{ ok: false, error }`, `{ success: false, message }`,
    // `{ message }` or `{ message, errors }`.
    if (data && typeof data === "object") {
      const body = data as ApiErrorBody
      if (typeof body.error?.message === "string" && body.error.message.trim()) {
        return body.error.message
      }
      if (typeof body.message === "string" && body.message.trim()) {
        return body.message
      }
      if (typeof body.errors === "string" && body.errors.trim()) {
        return body.errors
      }
    }
    // A plain-text body.
    if (typeof data === "string" && data.trim() && !isAxiosGeneratedMessage(data.trim())) {
      return data
    }

    if (!error.response) return "Network error. Check your connection."
    if (error.response.status === 429) {
      return "Too many attempts. Wait a moment and try again."
    }
    if (error.response.status === 401) return "Incorrect credentials."
    if (error.response.status === 403) return "You are not allowed to do that."
    // Never surface axios's own "Request failed with status code N".
    return "Something went wrong. Please try again."
  }

  // Axios/HTTP messages are never useful to a user; only messages we raised
  // ourselves are shown as-is.
  if (error instanceof Error && error.message && !isAxiosGeneratedMessage(error.message)) {
    return error.message
  }
  return "Something went wrong. Please try again."
}

async function persist(data: AuthTokens): Promise<AuthTokens> {
  tokenManager.setTokens({
    accessToken: data.accessToken,
    idToken: data.idToken,
    expiresIn: data.expiresIn,
  })
  if (data.refreshToken) {
    await tokenManager.setRefreshToken(data.refreshToken)
    // Remember the issuing client so /refresh can present the same one.
    await secureStorage.storeAuthClient(data.client ?? "otp")
  }
  return data
}

/** Step 1 of phone sign-in — sends the OTP. */
export async function requestOtp(phone: string): Promise<OtpChallenge> {
  try {
    const { data } = await http.post<unknown>("/otp/request", {
      phone,
      role: "user",
    })
    return unwrap<OtpChallenge>(data)
  } catch (error) {
    const message = extractErrorMessage(error)
    // Backend validation/rate-limit messages are specific ("Invalid phone
    // number", "Too many requests"); anything generic is replaced with a
    // message about this number so the user knows what to do next.
    throw new Error(
      message === "Something went wrong. Please try again."
        ? `We couldn't send a code to ${phone}. Try again in a moment.`
        : message,
      { cause: error },
    )
  }
}

/**
 * Cognito hands out a new session after a wrong code, so a rejected attempt is
 * still retryable: the caller must keep the challenge and use the new session.
 */
export interface OtpRetry {
  answerCorrect: false
  session?: string
  message: string
}

export type OtpVerifyResult = AuthTokens | OtpRetry

/**
 * Unwraps the lambda's `{ ok: true, data }` envelope. Auth responses used to be
 * bare; calling them directly keeps older deployments working.
 */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "ok" in body && "data" in body) {
    return (body as { data: T }).data
  }
  return body as T
}

function isOtpRetry(data: unknown): data is OtpRetry {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { answerCorrect?: unknown }).answerCorrect === false
  )
}

/**
 * Step 2 of phone sign-in — exchanges the code for tokens.
 *
 * A correct code resolves with tokens. A wrong code the backend can still
 * recover from resolves with {@link OtpRetry} (carrying the next session); a
 * dead challenge, throttling or a transport failure throws.
 */
export async function verifyOtp(params: {
  otp: string
  username: string
  session: string
}): Promise<OtpVerifyResult> {
  try {
    const { data } = await http.post<unknown>("/otp/verify", params)
    const body = unwrap<AuthTokens | OtpRetry>(data)
    if (isOtpRetry(body)) {
      return {
        answerCorrect: false,
        session: body.session,
        message: body.message?.trim() || "That code is incorrect. Check it and try again.",
      }
    }
    if (!body?.accessToken || !body?.idToken) {
      throw new Error("Sign-in did not return a session. Please try again.")
    }
    return persist(body)
  } catch (error) {
    // Surface the backend's reason (wrong/expired code, throttled) instead of
    // the axios message; the caller shows this text as-is.
    throw new Error(extractErrorMessage(error), { cause: error })
  }
}

/** Username + password sign-in. */
export async function login(params: { username: string; password: string }): Promise<AuthTokens> {
  try {
    const { data } = await http.post<unknown>("/login", params)
    return persist(unwrap<AuthTokens>(data))
  } catch (error) {
    // The auth lambda answers `{ success: false, message }`; show that reason
    // (bad credentials, not an agent, throttled) rather than axios' text.
    throw new Error(extractErrorMessage(error), { cause: error })
  }
}

/**
 * Agent (staff) sign-in. The backend only issues a `userpass` session to users
 * in the `agent` group and rejects everyone else with 403, so this is the
 * app-facing counterpart of {@link login} with the client recorded up front.
 */
export async function loginAsAgent(params: {
  username: string
  password: string
}): Promise<AuthTokens> {
  const tokens = await login({
    username: params.username.trim().toLowerCase(),
    password: params.password,
  })
  return { ...tokens, client: "userpass" }
}

/**
 * Exchange the stored refresh token for a fresh access token. Cognito keeps
 * the refresh token the same here, so the caller's stored one stays valid.
 */
export async function refresh(): Promise<AuthTokens> {
  const refreshToken = await tokenManager.getRefreshToken()
  if (!refreshToken) {
    throw new Error("No refresh token available")
  }

  const client = (await secureStorage.getAuthClient()) as AuthClient | null
  const { data: raw } = await http.post<unknown>("/refresh", {
    refreshToken,
    client: client ?? "otp",
  })
  const data = unwrap<AuthTokens>(raw)
  // Cognito only returns an access token here — the ID token rides along as
  // `idToken` for our own session restore. Without either, the session is
  // unusable and must not be reported as signed in.
  if (!data?.accessToken || !data?.idToken) {
    throw new Error("Refresh response did not include usable tokens")
  }
  tokenManager.setTokens({
    accessToken: data.accessToken,
    idToken: data.idToken,
    expiresIn: data.expiresIn,
  })
  return { ...data, refreshToken }
}

/**
 * Drops the session locally without contacting the server. Used when the server
 * says the account behind the tokens is gone (or refuses the token): the tokens
 * can never become usable again, so keeping them would only trap the user in a
 * half-signed-in state.
 */
export async function discardSession(): Promise<void> {
  await tokenManager.clearAllTokens()
}

/** Revoke the session server-side (best effort) and clear local tokens. */
export async function logout(): Promise<void> {
  const accessToken = tokenManager.getRawAccessToken()
  try {
    if (accessToken) {
      await http.post("/logout", {}, { headers: { Authorization: `Bearer ${accessToken}` } })
    }
  } catch {
    // A failed sign-out shouldn't trap the user in the app.
  } finally {
    await tokenManager.clearAllTokens()
  }
}
