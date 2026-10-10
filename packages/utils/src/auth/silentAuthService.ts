import { tokenManager } from './tokenManager';
import { tokenRefreshService } from './tokenRefreshService';
import { refresh } from './authService';
import type { AuthUser } from './jwt';

export interface AuthState {
    isAuthenticated: boolean;
    user: AuthUser | null;
    error: string | null;
}

/**
 * Runs on app launch. If a refresh token is on the device, swap it for a live
 * access token and restore the user from the new ID token — no login screen.
 */
class SilentAuthService {
    async attemptSilentAuth(): Promise<AuthState> {
        const refreshToken = await tokenManager.getRefreshToken();

        if (!refreshToken) {
            return { isAuthenticated: false, user: null, error: null };
        }

        try {
            await refresh();
            tokenRefreshService.startAutoRefresh();

            return {
                isAuthenticated: true,
                user: tokenManager.getUser(),
                error: null,
            };
        } catch {
            await tokenManager.clearAllTokens();
            return {
                isAuthenticated: false,
                user: null,
                error: null,
            };
        }
    }
}

export const silentAuthService = new SilentAuthService();
