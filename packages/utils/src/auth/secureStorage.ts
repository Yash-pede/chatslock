import * as SecureStore from "expo-secure-store"

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

const REFRESH_TOKEN_KEY = "refresh_token"
const AUTH_CLIENT_KEY = "auth_client"
const SESSION_ID_KEY = "session_id"

class SecureStorageService {
  // Store refresh token securely using Keychain/Keystore
  async storeRefreshToken(token: string): Promise<boolean> {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token)
      return true
    } catch (error) {
      console.error("Failed to store refresh token:", error)
      return false
    }
  }

  // Retrieve refresh token from secure storage
  async getRefreshToken(): Promise<string | null> {
    try {
      const credentials = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
      return credentials ?? null
    } catch (error) {
      console.error("Failed to retrieve refresh token:", error)
      return null
    }
  }

  // Remove refresh token from storage
  async removeRefreshToken(): Promise<boolean> {
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
      return true
    } catch (error) {
      console.error("Failed to remove refresh token:", error)
      return false
    }
  }

  /**
   * Cognito app client that issued the stored refresh token. Refresh tokens are
   * client-bound, so this must be sent back to /refresh. Absent for sessions
   * created before this was recorded.
   */
  async storeAuthClient(client: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(AUTH_CLIENT_KEY, client)
    } catch (error) {
      console.error("Failed to store auth client:", error)
    }
  }

  async getAuthClient(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(AUTH_CLIENT_KEY)
    } catch (error) {
      console.error("Failed to retrieve auth client:", error)
      return null
    }
  }

  async removeAuthClient(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(AUTH_CLIENT_KEY)
    } catch (error) {
      console.error("Failed to remove auth client:", error)
    }
  }

  /** Public id of the auth session this device is using. */
  async storeSessionId(sessionId: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(SESSION_ID_KEY, sessionId)
    } catch (error) {
      console.error("Failed to store session id:", error)
    }
  }

  async getSessionId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(SESSION_ID_KEY)
    } catch (error) {
      console.error("Failed to retrieve session id:", error)
      return null
    }
  }

  async removeSessionId(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SESSION_ID_KEY)
    } catch (error) {
      console.error("Failed to remove session id:", error)
    }
  }

  // Clear all authentication data
  async clearAllTokens(): Promise<void> {
    await this.removeRefreshToken()
    await this.removeAuthClient()
    await this.removeSessionId()
  }
}

export const secureStorage = new SecureStorageService()
