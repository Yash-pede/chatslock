import type { Context } from "hono"
import type {
  CreateDirectConversationRequest,
  GetChatPageConversationRequest,
  GetConversationMessagesRequest,
  GetDirectConversationRequest,
  GetMessageRequest,
  MediaUploadPresignUrlRequest,
} from "@repo/types/req"
import {
  chatPageConversationsService,
  createDirectConversationService,
  getDirectConversationService,
  getMediaUploadPresignedUrl,
  getMessageService,
  listMessagesService,
} from "./conversatinos.service"

export const chatPageConversationsController = async (c: Context) => {
  const { query }: GetChatPageConversationRequest = c.get("valid")
  const resp = await chatPageConversationsService({
    userId: c.get("userId"),
    pageSize: query.pageSize,
    startKey: query.startKey,
  })

  return c.json(resp)
}

export const listMessagesController = async (c: Context) => {
  const { query }: GetConversationMessagesRequest = c.get("valid")

  const resp = await listMessagesService({
    userId: c.get("userId"),
    conversationId: query.conversationId,
    cursor: query.cursor,
    limit: query.limit,
  })

  return c.json(resp)
}

export const getMessageController = async (c: Context) => {
  const { query }: GetMessageRequest = c.get("valid")

  const resp = await getMessageService({
    userId: c.get("userId"),
    conversationId: query.conversationId,
    uid: query.uid,
  })

  return c.json(resp)
}

export const getMediaUploadPresignedUrlController = async (c: Context) => {
  const { body }: MediaUploadPresignUrlRequest = c.get("valid")

  const url = await getMediaUploadPresignedUrl({
    contentType: body.contentType,
    fileName: body.fileName,
    conversationId: body.conversationId,
  })
  return c.json(url)
}

export const getDirectConversationController = async (c: Context) => {
  const { query }: GetDirectConversationRequest = c.get("valid")
  const resp = await getDirectConversationService({
    userId: c.get("userId"),
    otherUserId: query.userId,
  })

  return c.json(resp)
}

export const createDirectConversationController = async (c: Context) => {
  const { body }: CreateDirectConversationRequest = c.get("valid")
  const resp = await createDirectConversationService({
    userId: c.get("userId"),
    otherUserId: body.userId,
  })

  return c.json(resp)
}
