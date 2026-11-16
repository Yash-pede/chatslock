import { tokenManager } from "./tokenManager"
import { refresh } from "./authService"
import { authEvents, isNetworkError } from "./authEvents"

const RETRY_BASE_DELAY_MS = 5_000
const RETRY_MAX_DELAY_MS = 60_000

/**
 * Refreshes the access token shortly before it expires so the app rarely hits a
 * 401 at all. The axios interceptor is the safety net; this is the fast path.
 *
 * A network failure must not end the session: the tokens are kept and the
 * refresh is retried with backoff. Only a real auth rejection clears tokens.
 */
class TokenRefreshService {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryDelay = RETRY_BASE_DELAY_MS
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
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.retryDelay = RETRY_BASE_DELAY_MS
  }

  private scheduleRefresh(): void {
    this.stopAutoRefresh()

    const timeUntilExpiry = tokenManager.getTimeUntilExpiry()
    if (timeUntilExpiry <= 0) {
      void this.refreshNow().catch(() => undefined)
      return
    }

    const delay = Math.max((timeUntilExpiry - this.REFRESH_THRESHOLD) * 1000, 0)
    this.refreshTimer = setTimeout(() => void this.refreshNow().catch(() => undefined), delay)
  }

  /** Backoff used after a transport failure; the session is still valid. */
  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)

    const delay = this.retryDelay
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_DELAY_MS)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.refreshNow().catch(() => undefined)
    }, delay)
  }

  /**
   * Access token for consumers that need one *now* (e.g., a WebSocket handshake,
   * which cannot wait on an axios 401 replay). Returns null while a refresh is
   * in flight; concurrent callers share it instead of hammering Cognito.
   */
  ensureAccessToken(): string | null {
    const token = tokenManager.getAccessToken()
    if (token) return token
    // `getRefreshToken` reads secure storage (async), so `performRefresh`
    // re-checks the session itself; here it only avoids starting a refresh that
    // cannot succeed. Callers retry until a token appears.
    if (!this.inFlight) void this.refreshNow().catch(() => undefined)
    return null
  }

  /** Forces a refresh (e.g., the socket handshake was rejected with a stale token). */
  refreshNow(): Promise<void> {
    this.inFlight ??= this.performRefresh().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async performRefresh(): Promise<void> {
    try {
      await refresh()
      this.retryDelay = RETRY_BASE_DELAY_MS
      this.scheduleRefresh()
    } catch (error) {
      if (isNetworkError(error)) {
        // Offline or the request never reached the server: keep the session.
        this.scheduleRetry()
        throw error
      }

      await tokenManager.clearAllTokens()
      this.stopAutoRefresh()
      authEvents.emitLogout()
      throw error
    }
  }
}

export const tokenRefreshService = new TokenRefreshService()
