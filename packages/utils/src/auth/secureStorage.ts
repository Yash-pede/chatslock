import * as SecureStore from 'expo-secure-store';

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const AUTH_CLIENT_KEY = 'auth_client';

class SecureStorageService {
    // Store refresh token securely using Keychain/Keystore
    async storeRefreshToken(token: string): Promise<boolean> {
        try {
            await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
            return true;
        } catch (error) {
            console.error('Failed to store refresh token:', error);
            return false;
        }
    }

    // Retrieve refresh token from secure storage
    async getRefreshToken(): Promise<string | null> {
        try {
            const credentials = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
            return credentials ?? null;
        } catch (error) {
            console.error('Failed to retrieve refresh token:', error);
            return null;
        }
    }

    // Remove refresh token from storage
    async removeRefreshToken(): Promise<boolean> {
        try {
            await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
            return true;
        } catch (error) {
            console.error('Failed to remove refresh token:', error);
            return false;
        }
    }

    /**
     * Cognito app client that issued the stored refresh token. Refresh tokens are
     * client-bound, so this must be sent back to /refresh. Absent for sessions
     * created before this was recorded.
     */
    async storeAuthClient(client: string): Promise<void> {
        try {
            await SecureStore.setItemAsync(AUTH_CLIENT_KEY, client);
        } catch (error) {
            console.error('Failed to store auth client:', error);
        }
    }

    async getAuthClient(): Promise<string | null> {
        try {
            return await SecureStore.getItemAsync(AUTH_CLIENT_KEY);
        } catch (error) {
            console.error('Failed to retrieve auth client:', error);
            return null;
        }
    }

    async removeAuthClient(): Promise<void> {
        try {
            await SecureStore.deleteItemAsync(AUTH_CLIENT_KEY);
        } catch (error) {
            console.error('Failed to remove auth client:', error);
        }
    }

    // Clear all authentication data
    async clearAllTokens(): Promise<void> {
        await this.removeRefreshToken();
        await this.removeAuthClient();
    }
}

export const secureStorage = new SecureStorageService();