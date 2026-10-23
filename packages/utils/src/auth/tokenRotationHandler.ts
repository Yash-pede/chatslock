import { tokenManager } from "./tokenManager"

interface RotatedTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  rotationId?: string
}

class TokenRotationHandler {
  private lastRotationId: string | null = null

  async handleRotation(tokens: RotatedTokens): Promise<void> {
    if (tokens.rotationId && tokens.rotationId === this.lastRotationId) {
      console.warn("Duplicate rotation detected, skipping")
      return
    }

    tokenManager.setAccessToken(tokens.accessToken, tokens.expiresIn)
    await tokenManager.setRefreshToken(tokens.refreshToken)

    if (tokens.rotationId) {
      this.lastRotationId = tokens.rotationId
    }
  }

  clearRotationState(): void {
    this.lastRotationId = null
  }
}

export const tokenRotationHandler = new TokenRotationHandler()
