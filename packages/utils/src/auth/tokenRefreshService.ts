import { tokenManager } from "./tokenManager"
import { refresh } from "./authService"
import { authEvents } from "./authEvents"

/**
 * Refreshes the access token shortly before it expires so the app rarely hits a
 * 401 at all. The axios interceptor is the safety net; this is the fast path.
 */
class TokenRefreshService {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<void> | null = null
  private readonly REFRESH_THRESHOLD = 60 // seconds before expiry

  startAutoRefresh(): void {
    this.scheduleRefresh()
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private scheduleRefresh(): void {
    this.stopAutoRefresh()

    const timeUntilExpiry = tokenManager.getTimeUntilExpiry()
    if (timeUntilExpiry <= 0) {
      void this.refreshNow()
      return
    }

    const delay = Math.max((timeUntilExpiry - this.REFRESH_THRESHOLD) * 1000, 0)
    this.refreshTimer = setTimeout(() => void this.refreshNow(), delay)
  }

  /**
   * Access token for consumers that need one *now* (e.g. a WebSocket handshake,
   * which cannot wait on an axios 401 replay). Returns null while a refresh is
   * in flight; concurrent callers share it instead of hammering Cognito.
   */
  ensureAccessToken(): string | null {
    const token = tokenManager.getAccessToken()
    if (token) return token
    // `getRefreshToken` reads secure storage (async), so `performRefresh`
    // re-checks the session itself; here it only avoids starting a refresh that
    // cannot succeed. Callers retry until a token appears.
    if (!this.inFlight) void this.refreshNow()
    return null
  }

  /** Forces a refresh (e.g. the socket handshake was rejected with a stale token). */
  refreshNow(): Promise<void> {
    this.inFlight ??= this.performRefresh()
      .catch(() => undefined)
      .finally(() => {
        this.inFlight = null
      })
    return this.inFlight
  }

  private async performRefresh(): Promise<void> {
    try {
      await refresh()
      this.scheduleRefresh()
    } catch {
      await tokenManager.clearAllTokens()
      this.stopAutoRefresh()
      authEvents.emitLogout()
    }
  }
}

export const tokenRefreshService = new TokenRefreshService()
