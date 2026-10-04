import axios from 'axios';
import { tokenManager } from './tokenManager';
import { tokenRefreshService } from './tokenRefreshService';
import apiClient from '../api';

const API_BASE_URL = 'https://api.yourapp.com';

interface UserProfile {
    id: string;
    email: string;
    name: string;
}

interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: UserProfile | null;
    error: string | null;
}

interface RefreshResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

class SilentAuthService {
    // Attempt silent authentication on app launch
    async attemptSilentAuth(): Promise<AuthState> {
        try {
            const refreshToken = await tokenManager.getRefreshToken();

            if (!refreshToken) {
                return {
                    isAuthenticated: false,
                    isLoading: false,
                    user: null,
                    error: null,
                };
            }

            // Try to refresh the access token
            const response = await axios.post<RefreshResponse>(
                `${API_BASE_URL}/auth/refresh`,
                { refreshToken },
                {
                    headers: { 'Content-Type': 'application/json' },
                }
            );

            const { accessToken, refreshToken: newRefreshToken, expiresIn } = response.data;

            // Store new tokens
            tokenManager.setAccessToken(accessToken, expiresIn);
            await tokenManager.setRefreshToken(newRefreshToken);

            // Fetch user profile
            const userResponse = await apiClient.get<UserProfile>('/auth/me');

            // Start automatic refresh
            tokenRefreshService.startAutoRefresh();

            return {
                isAuthenticated: true,
                isLoading: false,
                user: userResponse.data,
                error: null,
            };
        } catch (error) {
            // Silent auth failed, clear tokens
            await tokenManager.clearAllTokens();

            return {
                isAuthenticated: false,
                isLoading: false,
                user: null,
                error: 'Session expired. Please login again.',
            };
        }
    }
}

export const silentAuthService = new SilentAuthService();