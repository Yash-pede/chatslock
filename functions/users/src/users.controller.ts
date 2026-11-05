import type { Context } from "hono"
import type {
  AvatarImagePresignUrlRequest,
  ConfirmAvatarUploadRequest,
  RevokeSessionRequest,
  UpdateMyProfileRequest,
  UpdateSessionPushTokenRequest,
  UserOnboardingRequest,
} from "@repo/types/req"
import {
  confirmAvatarUpload,
  getAvatarPresignedUrl,
  getUserById,
  getUserSessions,
  onboardUser,
  revokeUserSession,
  updateMyProfile,
  updateSessionPushToken,
} from "./users.service"

export const onboardingController = async (c: Context) => {
  const { body }: UserOnboardingRequest = c.get("valid")

  const resp = await onboardUser({
    userId: c.get("userId"),
    cognitoUsername: c.get("cognitoUsername"),
    username: body.username,
    fullName: body.fullName,
    phone: body.phone,
    agentUsername: body.agentUsername,
  })

  return c.json(resp)
}

export const getUserByIdController = async (c: Context) => {
  const resp = await getUserById({ userId: c.get("userId") })

  return c.json(resp)
}

export const getAvatarPresignedUrlController = async (c: Context) => {
  const { body }: AvatarImagePresignUrlRequest = c.get("valid")
  const userId = c.get("userId")

  const url = await getAvatarPresignedUrl({
    userId,
    contentType: body.contentType,
    fileName: body.fileName,
  })
  return c.json(url)
}

export const confirmAvatarUploadController = async (c: Context) => {
  const { body }: ConfirmAvatarUploadRequest = c.get("valid")

  const resp = await confirmAvatarUpload({ userId: c.get("userId"), key: body.key })

  return c.json(resp)
}

export const updateMyProfileController = async (c: Context) => {
  const { body }: UpdateMyProfileRequest = c.get("valid")

  const resp = await updateMyProfile({
    userId: c.get("userId"),
    fullName: body.fullName,
    avatar: body.avatar,
  })

  return c.json(resp)
}

/** Updates the Expo push token on this device's auth session. */
export const updateSessionPushTokenController = async (c: Context) => {
  const { body }: UpdateSessionPushTokenRequest = c.get("valid")

  await updateSessionPushToken({
    userId: c.get("userId"),
    sessionId: body.sessionId,
    expoPushToken: body.expoPushToken,
  })

  return c.json({ message: "Session updated" })
}

/** Active sessions for the current account. */
export const getSessionsController = async (c: Context) => {
  const sessions = await getUserSessions({ userId: c.get("userId") })
  return c.json({ sessions })
}

/** Revokes one session by the hash id returned by the sessions list. */
export const revokeSessionController = async (c: Context) => {
  const { params }: RevokeSessionRequest = c.get("valid")

  await revokeUserSession({ userId: c.get("userId"), refreshTokenHash: params.id })
  return c.json({ message: "Session revoked" })
}
