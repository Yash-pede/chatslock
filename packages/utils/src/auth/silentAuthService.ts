import { tokenManager } from "./tokenManager"
import { tokenRefreshService } from "./tokenRefreshService"
import { refresh } from "./authService"
import { isNetworkError } from "./authEvents"
import type { AuthUser } from "./jwt"

export interface AuthState {
  isAuthenticated: boolean
  user: AuthUser | null
  error: string | null
}

/**
 * Runs on app launch. If a refresh token is on the device, swap it for a live
 * access token and restore the user from the new ID token — no login screen.
 *
 * Only a rejected refresh (revoked/expired token) clears the session. A network
 * failure keeps the tokens so the next launch can try again.
 */
class SilentAuthService {
  async attemptSilentAuth(): Promise<AuthState> {
    const refreshToken = await tokenManager.getRefreshToken()

    if (!refreshToken) {
      return { isAuthenticated: false, user: null, error: null }
    }

    try {
      await refresh()
      tokenRefreshService.startAutoRefresh()

      const user = tokenManager.getUser()

      return {
        isAuthenticated: Boolean(user),
        user,
        error: user ? null : "Your session has expired. Please sign in again.",
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        await tokenManager.clearAllTokens()
      }
      return {
        isAuthenticated: false,
        user: null,
        error: isNetworkError(error) ? "Network error. Check your connection." : null,
      }
    }
  }
}

export const silentAuthService = new SilentAuthService()
