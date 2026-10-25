import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { usersDao, authDao, conversationsDao } from "@repo/api/dao"
import { ApiException, AWSManager } from "@repo/api/utils"
import { AVATAR_CONTENT_TYPES, avatarFileExtension, type AvatarContentType } from "@repo/types/req"
import { HTTPException } from "hono/http-exception"

export const onboardUser = async ({
  userId,
  cognitoUsername,
  fullName,
  username,
  phone,
  agentId,
}: {
  userId: string
  cognitoUsername: string
  fullName: string
  username: string
  phone: string
  agentId?: string
}) => {
  try {
    await authDao.addUserToGroup({ cognitoUsername, groupName: "user" })
    await usersDao.createUser({
      userId,
      cognitoUsername,
      fullName,
      username,
      role: "user",
      phone,
      ...(agentId !== undefined ? { agentId } : {}),
    })

    if (agentId) {
      try {
        await conversationsDao.createDirectConversation([userId, agentId])
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
