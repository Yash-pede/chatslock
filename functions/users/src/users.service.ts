import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { usersDao, authDao, conversationsDao, revokeAuthSession } from "@repo/api/dao"
import { ApiException, AWSManager } from "@repo/api/utils"
import { AVATAR_CONTENT_TYPES, avatarFileExtension, type AvatarContentType } from "@repo/types/req"
import { HTTPException } from "hono/http-exception"

export const onboardUser = async ({
  userId,
  cognitoUsername,
  fullName,
  username,
  phone,
  agentUsername,
}: {
  userId: string
  cognitoUsername: string
  fullName: string
  username: string
  phone: string
  agentUsername?: string
}) => {
  // The shared link carries a username; conversations are keyed by user id.
  let agentUserId: string | undefined
  if (agentUsername) {
    try {
      const [agent] = (await usersDao.getUserByUsername({ username: agentUsername })) ?? []
      if (agent && agent.userId !== userId) agentUserId = agent.userId
    } catch (err) {
      // A bad/unknown invite link must not block onboarding.
      console.error("Failed to resolve agent username", err)
    }
  }

  try {
    await authDao.addUserToGroup({ cognitoUsername, groupName: "user" })
    await usersDao.createUser({
      userId,
      cognitoUsername,
      fullName,
      username,
      role: "user",
      phone,
      ...(agentUserId ? { agentId: agentUserId } : {}),
    })

    if (agentUserId) {
      try {
        await conversationsDao.createDirectConversation([userId, agentUserId])
      } catch (err) {
        console.error("Failed to start conversation", err)
        return "user Onboarding completed but failed to start conversation"
      }
    }

    return "user Onboarding completed successfully"
  } catch (err) {
    console.error("Failed to onboard user", err)
    if (err instanceof HTTPException) throw err

    throw new HTTPException(500, {
      message: "Failed to onboard user",
    })
  }
}

export const getUserById = async ({ userId }: { userId: string }) => {
  const user = await usersDao.getUserById({ userId })
  if (!user) {
    throw new HTTPException(404, { message: "User not found" })
  }
  return user
}

/**
 * Presigns a direct PUT of a profile avatar into the media bucket. The client
 * validates the file, this signs a short-lived URL bound to an allowlisted
 * image content type and a server-chosen key under the caller's own folder, so
 * a client cannot upload to another user's path or set its own key.
 */
export const getAvatarPresignedUrl = async ({
  userId,
  contentType,
  fileName,
}: {
  userId: string
  contentType: AvatarContentType
  fileName: string
}) => {
  const extension = avatarFileExtension(fileName)
  if (!AVATAR_CONTENT_TYPES.includes(contentType) || !extension) {
    throw new ApiException(400, {
      code: "INVALID_FILE_TYPE",
      message: "Only JPEG, PNG or WebP images are allowed",
    })
  }

  const bucket = await AWSManager.getSecretValue("s3_media_bucket")
  if (!bucket) {
    console.error("Media bucket is not configured")
    throw new ApiException(500, { message: "Could not prepare the upload" })
  }

  const key = `uploads/users/${userId}/profile-image/${crypto.randomUUID()}.${extension}`
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(AWSManager.s3Client, command, {
    expiresIn: 180,
  })

  return { uploadUrl, key }
}

/**
 * Public object URL for an uploaded avatar. The media bucket allows public
 * `GetObject`, so the client can render the stored URL directly.
 */
async function avatarUrlFor(key: string): Promise<string> {
  const region = process.env.AWS_REGION ?? "us-east-1"
  const bucket = await AWSManager.getSecretValue("s3_media_bucket")

  if (!bucket) {
    console.error("Media bucket is not configured")
    throw new ApiException(500, { message: "Could not save the avatar" })
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

/**
 * Persists the avatar after the client has PUT the bytes to the presigned URL.
 * The key must be inside the caller's own folder, so one user can never point
 * their profile at another user's upload.
 */
export const confirmAvatarUpload = async ({ userId, key }: { userId: string; key: string }) => {
  if (!key.startsWith(`uploads/users/${userId}/profile-image/`)) {
    throw new ApiException(403, {
      code: "INVALID_UPLOAD_KEY",
      message: "That upload does not belong to you",
    })
  }

  const avatar = await avatarUrlFor(key)
  await usersDao.updateUser({ userId, avatar })

  return { avatar }
}

/** Updates the caller's own editable profile fields. */
export const updateMyProfile = async ({
  userId,
  fullName,
  avatar,
}: {
  userId: string
  fullName?: string
  avatar?: string
}) => {
  await usersDao.updateUser({
    userId,
    ...(fullName !== undefined ? { fullName } : {}),
    ...(avatar !== undefined ? { avatar } : {}),
  })

  return getUserById({ userId })
}

/**
 * Stores this installation's Expo push token under
 * `USER#<userId>` / `SESSION#<tokenValue>`. Re-registering the same token
 * refreshes its TTL; at most `MAX_USER_SESSIONS` sessions are kept.
 */
/**
 * Attaches the Expo push token to the caller's current auth session. One row
 * per session, so the token is updated in place (no separate push rows).
 */
export const updateSessionPushToken = async ({
  userId,
  sessionId,
  expoPushToken,
}: {
  userId: string
  sessionId: string
  expoPushToken: string
}): Promise<void> => {
  const session = await usersDao.getAuthSessionByHash({
    userId,
    refreshTokenHash: sessionId,
  })
  if (!session) throw new HTTPException(404, { message: "Session not found" })

  await usersDao.updateAuthSessionPushToken({
    userId,
    refreshTokenHash: session.refreshTokenHash,
    expoPushToken,
  })
}

export interface UserSessionSummary {
  id: string
  deviceName: string
  platform: "ios" | "android" | "web" | null
  createdAt: number
  lastUsedAt: number
}

/** Active auth sessions for the Sessions screen, newest activity first. */
export const getUserSessions = async ({
  userId,
}: {
  userId: string
}): Promise<UserSessionSummary[]> => {
  const now = Math.floor(Date.now() / 1000)
  const sessions = await usersDao.getAuthSessions({ userId })

  return sessions
    .filter((session) => session.expiresAt > now)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .map((session) => ({
      id: session.refreshTokenHash,
      deviceName: session.deviceName ?? "Unknown device",
      platform: session.platform ?? null,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
    }))
}

/**
 * Revokes one session: Cognito refresh token first, then the registry row.
 * Deleting the current device's session is handled by the client after this.
 */
export const revokeUserSession = async ({
  userId,
  refreshTokenHash,
}: {
  userId: string
  refreshTokenHash: string
}): Promise<void> => {
  const revoked = await revokeAuthSession({ userId, refreshTokenHash })
  if (!revoked) throw new HTTPException(404, { message: "Session not found" })
}
