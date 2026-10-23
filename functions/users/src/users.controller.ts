import type { Context } from "hono"
import type {
  AvatarImagePresignUrlRequest,
  ConfirmAvatarUploadRequest,
  UpdateMyProfileRequest,
  UserOnboardingRequest,
} from "@repo/types/req"
import {
  confirmAvatarUpload,
  getAvatarPresignedUrl,
  getUserById,
  onboardUser,
  updateMyProfile,
} from "./users.service"

export const onboardingController = async (c: Context) => {
  const { body }: UserOnboardingRequest = c.get("valid")

  const resp = await onboardUser({
    userId: c.get("userId"),
    cognitoUsername: c.get("cognitoUsername"),
    username: body.username,
    fullName: body.fullName,
    agentId: body.agentId,
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
