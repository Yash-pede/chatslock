import { authDao } from "./auth.dao"
import { usersDao } from "./users.dao"

/**
 * Revokes one auth session: the Cognito refresh token first, then its registry
 * row. Returns false when the row no longer exists (already logged out or
 * evicted), which makes logout idempotent.
 */
export const revokeAuthSession = async ({
  userId,
  refreshTokenHash,
}: {
  userId: string
  refreshTokenHash?: string
}): Promise<boolean> => {
  const session = refreshTokenHash
    ? await usersDao.getAuthSessionByHash({ userId, refreshTokenHash })
    : undefined

  if (!session) return false

  try {
    await authDao.revokeToken({
      refreshToken: session.refreshToken,
      client: session.client,
    })
  } catch (error) {
    // Even if Cognito refuses (already expired/revoked), drop the row so it
    // stops counting toward the session limit.
    console.error("[auth] failed to revoke Cognito refresh token", error)
  }

  await usersDao.deleteAuthSession({
    userId,
    refreshTokenHash: session.refreshTokenHash,
  })

  return true
}
