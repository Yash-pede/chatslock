import { conversationsDao, messagesDao, usersDao } from "@repo/api/dao"
import { ApiException, AWSManager, generateUlid, parseConversationId } from "@repo/api/utils"
import {
  AVATAR_CONTENT_TYPES,
  avatarFileExtension,
  type AvatarContentType,
  mediaFileExtension,
  normalizeMediaContentType,
} from "@repo/types/req"
import type {
  ConversationId,
  ConversationUserProfile,
  Message,
  MessageId,
  UserId,
  UserMemberConversation,
} from "@repo/types/schema"
import { MAX_MEDIA_FILE_SIZE } from "@repo/types/req"
import { createPresignedPost } from "@aws-sdk/s3-presigned-post"

/** Splits `TYPE#id`; a malformed id is a client error. */
const conversationRef = (conversationId: ConversationId) => {
  try {
    return parseConversationId(conversationId)
  } catch {
    throw new ApiException(422, { message: `Invalid conversation id "${conversationId}"` })
  }
}

/**
 * Confirms the caller is a participant by checking that the storage part of the
 * conversation id (`user1#user2`) contains the userId from the access token, or
 * throws 403.
 */
const assertConversationAccess = async ({
  userId,
  conversationId,
}: {
  userId: UserId
  conversationId: ConversationId
}): Promise<void> => {
  const { type, conversationId: storageId } = conversationRef(conversationId)

  if (type === "DIRECT" && !storageId.split("#").includes(userId)) {
    throw new ApiException(403, { message: "You are not a participant of this conversation" })
  }
}

/**
 * One page of message history, newest first, oldest id as the next cursor.
 * `undefined` means the conversation has no older messages.
 */
export const listMessagesService = async ({
  userId,
  conversationId,
  cursor,
  limit,
}: {
  userId: UserId
  conversationId: ConversationId
  cursor?: MessageId
  limit: number
}): Promise<{ messages: Message[]; nextCursor?: MessageId }> => {
  await assertConversationAccess({ userId, conversationId })

  const messages = await messagesDao.getMessagesByConversationId({
    conversationId,
    ...(cursor ? { cursor } : {}),
    limit,
  })

  const oldest = messages.at(-1)
  return {
    messages,
    nextCursor: messages.length === limit && oldest ? oldest.messageId : undefined,
  }
}

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
  contentType: string
  fileName: string
  conversationId: string
}) => {
  const extension = mediaFileExtension(fileName)
  const resolved = normalizeMediaContentType(fileName, contentType)
  if (!extension || !resolved) {
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
    // Voice notes and larger files can take a while on mobile networks; a
    // two-minute policy expired mid-upload and surfaced as a failed send.
    Expires: 60 * 10,
    Conditions: [["content-length-range", 1, MAX_MEDIA_FILE_SIZE]],
  })

  return { uploadUrl: encodeURI(command.url), fields: command.fields, key }
}
