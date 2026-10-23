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
  /** Envelope shape returned by the users lambda: `{ ok: false, error }`. */
  error?: { code?: string; message?: string }
}

/** Pull the backend's human-readable message out of an axios error. */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data

    // A JSON body ({ error } / { message } / { message, errors }).
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
    if (typeof data === "string" && data.trim()) {
      return data
    }

    if (!error.response) return "Network error. Check your connection."
    if (error.response.status === 401) return "Incorrect credentials."
    if (error.response.status === 403) return "You are not allowed to do that."
    // Never surface axios's own "Request failed with status code N".
    return "Something went wrong. Please try again."
  }

  // Axios/HTTP messages ("Request failed with status code 400") are never
  // useful to a user; only messages we raised ourselves are shown as-is.
  if (
    error instanceof Error &&
    error.message &&
    !/^Request failed with status code \d+$/.test(error.message)
  ) {
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
    const { data } = await http.post<OtpChallenge>("/otp/request", {
      phone,
      role: "user",
    })
    return data
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

/** Step 2 of phone sign-in — exchanges the code for tokens. */
export async function verifyOtp(params: {
  otp: string
  username: string
  session: string
}): Promise<AuthTokens> {
  const { data } = await http.post<AuthTokens>("/otp/verify", params)
  return persist(data)
}

/** Username + password sign-in. */
export async function login(params: { username: string; password: string }): Promise<AuthTokens> {
  const { data } = await http.post<AuthTokens>("/login", params)
  return persist(data)
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
  const { data } = await http.post<AuthTokens>("/refresh", {
    refreshToken,
    client: client ?? "otp",
  })
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
