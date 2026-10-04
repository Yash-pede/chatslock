import axios from 'axios';
import { tokenManager } from './tokenManager';

const API_BASE_URL = 'https://api.yourapp.com';

interface RefreshResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

class TokenRefreshService {
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly REFRESH_THRESHOLD = 60; // Refresh 60 seconds before expiry

    // Start the automatic refresh cycle
    startAutoRefresh(): void {
        this.scheduleRefresh();
    }

    // Stop automatic refresh
    stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    // Schedule the next refresh
    private scheduleRefresh(): void {
        this.stopAutoRefresh();

        const timeUntilExpiry = tokenManager.getTimeUntilExpiry();

        if (timeUntilExpiry <= 0) {
            // Token already expired, refresh immediately
            this.performRefresh();
            return;
        }

        // Schedule refresh before expiration
        const refreshDelay = Math.max(
            (timeUntilExpiry - this.REFRESH_THRESHOLD) * 1000,
            0
        );

        this.refreshTimer = setTimeout(() => {
            this.performRefresh();
        }, refreshDelay);
    }

    // Perform the token refresh
    private async performRefresh(): Promise<void> {
        try {
            const refreshToken = await tokenManager.getRefreshToken();

            if (!refreshToken) {
                throw new Error('No refresh token available');
            }

            const response = await axios.post<RefreshResponse>(
                `${API_BASE_URL}/auth/refresh`,
                { refreshToken },
                {
                    headers: { 'Content-Type': 'application/json' },
                }
            );

            const { accessToken, refreshToken: newRefreshToken, expiresIn } = response.data;

            tokenManager.setAccessToken(accessToken, expiresIn);
            await tokenManager.setRefreshToken(newRefreshToken);

            // Schedule the next refresh
            this.scheduleRefresh();
        } catch (error) {
            console.error('Token refresh failed:', error);
            // Handle refresh failure - typically logout user
            this.handleRefreshFailure();
        }
    }

    // Handle refresh failure
    private async handleRefreshFailure(): Promise<void> {
        await tokenManager.clearAllTokens();
        this.stopAutoRefresh();
        // Trigger navigation to login screen
        // This depends on your navigation setup
    }
}

export const tokenRefreshService = new TokenRefreshService();