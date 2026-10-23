import { tokenManager } from "./tokenManager"
import { refresh } from "./authService"
import { authEvents } from "./authEvents"

/**
 * Refreshes the access token shortly before it expires so the app rarely hits a
 * 401 at all. The axios interceptor is the safety net; this is the fast path.
 */
class TokenRefreshService {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
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
      void this.performRefresh()
      return
    }

    const delay = Math.max((timeUntilExpiry - this.REFRESH_THRESHOLD) * 1000, 0)
    this.refreshTimer = setTimeout(() => void this.performRefresh(), delay)
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
