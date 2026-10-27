import {
  loginAsAgent,
  requestOtp,
  tokenManager,
  tokenRefreshService,
  verifyOtp as verifyOtpCode,
  type AuthUser,
  type OtpChallenge,
  type OtpVerifyResult,
} from "@repo/utils"

/**
 * Authentication only: does this device hold a session, and how do we get one.
 *
 * The profile (`GET /api/users/me`) is NOT read here. Auth must not wait on the
 * network to report a token, otherwise a 404 from the profile API looks like a
 * failed login and the sign-in screen never closes.
 */
export type AuthState =
  | { status: "restoring" }
  | { status: "signedOut"; error: string | null }
  | { status: "signedIn"; identity: AuthUser }

/** The phone number the last OTP was requested for on this device. */
let verifiedPhone: string | null = null

export function rememberPhone(phone: string | null): void {
  verifiedPhone = phone
}

/**
 * The phone the session was created with, needed to create the profile row.
 *
 * The ID token only carries `phone_number` when the pool maps that claim onto
 * the token, so the number the OTP was requested for is the reliable source.
 */
export function phoneFor(identity: AuthUser | null): string | null {
  return verifiedPhone ?? identity?.phone ?? null
}

/** The stored identity, or `null` when there are no tokens. */
export function storedIdentity(): AuthUser | null {
  return tokenManager.getUser()
}

/** Tokens are on the device: start refreshing and report them. */
export function signedIn(identity: AuthUser): AuthState {
  tokenRefreshService.startAutoRefresh()
  return { status: "signedIn", identity }
}

/** Cognito credential exchanges. Throws with a user-facing message. */
export const authApi = {
  requestCode: (phone: string): Promise<OtpChallenge> => requestOtp(phone),
  verifyCode: (params: {
    otp: string
    username: string
    session: string
  }): Promise<OtpVerifyResult> => verifyOtpCode(params),
  signInAsAgent: (params: { username: string; password: string }) => loginAsAgent(params),
}
