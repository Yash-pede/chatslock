import { secureStorage } from "./secureStorage"
import { claimsToUser, decodeJwt, type AuthUser, type IdTokenClaims } from "./jwt"

export interface TokenSet {
  accessToken: string
  /** Seconds until the access token expires (Cognito `ExpiresIn`). */
  expiresIn: number
  idToken?: string
  refreshToken?: string
}

interface TokenState {
  accessToken: string | null
  idToken: string | null
  accessTokenExpiry: number | null
  user: AuthUser | null
}

class TokenManager {
  private state: TokenState = {
    accessToken: null,
    idToken: null,
    accessTokenExpiry: null,
    user: null,
  }

  /** Store a full token set from a login/verify/refresh response. */
  setTokens(tokens: TokenSet): void {
    this.state.accessToken = tokens.accessToken
    // `expiresIn` is in seconds — convert to ms (the old code multiplied by
    // 1500, which made tokens look valid for 25 minutes).
    this.state.accessTokenExpiry = Date.now() + tokens.expiresIn * 1000

    if (tokens.idToken) {
      this.state.idToken = tokens.idToken
      this.state.user = claimsToUser(decodeJwt<IdTokenClaims>(tokens.idToken))
    }
  }

  setAccessToken(token: string, expiresIn: number): void {
    this.state.accessToken = token
    this.state.accessTokenExpiry = Date.now() + expiresIn * 1000
  }

  /** Current access token, or `null` when missing/expired. */
  getAccessToken(): string | null {
    if (this.isAccessTokenExpired()) {
      return null
    }
    return this.state.accessToken
  }

  /** Access token even if expired — needed as the refresh credential. */
  getRawAccessToken(): string | null {
    return this.state.accessToken
  }

  getIdToken(): string | null {
    return this.state.idToken
  }

  /** User profile decoded from the ID token. */
  getUser(): AuthUser | null {
    return this.state.user
  }

  isAccessTokenExpired(): boolean {
    if (!this.state.accessTokenExpiry) {
      return true
    }
    // 30-second buffer so a request never races the expiry.
    return Date.now() >= this.state.accessTokenExpiry - 30000
  }

  clearAccessToken(): void {
    this.state.accessToken = null
    this.state.idToken = null
    this.state.accessTokenExpiry = null
    this.state.user = null
  }

  getTimeUntilExpiry(): number {
    if (!this.state.accessTokenExpiry) {
      return 0
    }
    return Math.max(0, Math.floor((this.state.accessTokenExpiry - Date.now()) / 1000))
  }

  async setRefreshToken(token: string): Promise<boolean> {
    return secureStorage.storeRefreshToken(token)
  }

  async getRefreshToken(): Promise<string | null> {
    return secureStorage.getRefreshToken()
  }

  async clearAllTokens(): Promise<void> {
    this.clearAccessToken()
    await secureStorage.clearAllTokens()
  }
}

export const tokenManager = new TokenManager()
