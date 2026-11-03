import { conversationsDao, usersDao } from "@repo/api/dao"
import { ApiException, AWSManager, generateUlid } from "@repo/api/utils"
import {
  AVATAR_CONTENT_TYPES,
  avatarFileExtension,
  type AvatarContentType,
  MEDIA_CONTENT_TYPES,
  mediaFileExtension,
  type MediaContentType,
} from "@repo/types/req"
import type {
  ConversationUserProfile,
  UserMemberConversation,
} from "@repo/types/schema"
import { MAX_MEDIA_FILE_SIZE } from "@repo/types/req"
import { createPresignedPost } from "@aws-sdk/s3-presigned-post"

export const chatPageConversationsService = async ({
  userId,
  pageSize,
}: {
  userId: string
  pageSize: number
  startKey?: string
}): Promise<{ conversations: UserMemberConversation[] }> => {
  const conversations = await conversationsDao.getConversationsByUserId(userId)

  return { conversations: conversations.slice(0, pageSize) }
}

/**
 * Resolve the peer profiles for a set of user ids. Direct conversation ids are
 * `u1#u2`, so the client splits the id and asks for the other participant here
 * instead of receiving full user records in the conversation list.
 */
export const conversationProfilesService = async ({
  userIds,
}: {
  userIds: string[]
}): Promise<{ profiles: ConversationUserProfile[] }> => {
  const profiles = await usersDao.getPublicProfilesByIds({ userIds })

  return { profiles }
}

/**
 * Presigns a direct PUT of a media file into the media bucket.
 */
export const getMediaUploadPresignedUrl = async ({
  contentType,
  fileName,
  conversationId,
}: {
  contentType: MediaContentType
  fileName: string
  conversationId: string
}) => {
  const extension = mediaFileExtension(fileName)
  if (!MEDIA_CONTENT_TYPES.includes(contentType) || !extension) {
    throw new ApiException(400, {
      code: "INVALID_FILE_TYPE",
      message: "This file type is not allowed",
    })
  }

  const bucket = await AWSManager.getSecretValue("s3_media_bucket")
  if (!bucket) {
    console.error("Media bucket is not configured")
    throw new ApiException(500, { message: "Could not prepare the upload" })
  }

  const key = `uploads/conversation/${conversationId}/${generateUlid()}.${extension}`
  const command = await createPresignedPost(AWSManager.s3Client, {
    Bucket: bucket,
    Key: key,
    Expires: 60 * 2,
    Conditions: [["content-length-range", 1, MAX_MEDIA_FILE_SIZE]],
  })

  return { uploadUrl: encodeURI(command.url), fields: command.fields, key }
}
