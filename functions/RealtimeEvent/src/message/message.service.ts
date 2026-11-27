import { conversationsDao, messagesDao, usersDao } from "@repo/api/dao"
import { messagePushNotification, sendPushNotification } from "@repo/api/notifications"
import { ApiException, assertConversationMember, AWSManager, parseOrThrow } from "@repo/api/utils"
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_ACTION_WINDOW_MS,
  getPeerUserId,
  messagePreview,
  type ConversationId,
  type Message,
  type MessageUID,
  type UserId,
} from "@repo/types/schema"
import type { DeleteMessageReq, EditMessageReq, SendMessageReq } from "@repo/types/req"

const { logger } = AWSManager

/**
 * Pushes a message notification to every registered device of a peer. This is
 * best-effort: a push failure must never fail the message action.
 */
const notifyPeer = async ({
  peerId,
  senderId,
  message,
}: {
  peerId: UserId
  senderId: UserId
  message: Message
}): Promise<void> => {
  try {
    const [sender, sessions] = await Promise.all([
      usersDao.getUserById({ userId: senderId }).catch((error) => {
        logger.warn("Could not load sender for notification", { error })
        return undefined
      }),
      usersDao.getAuthSessions({ userId: peerId }),
    ])

    const now = Math.floor(Date.now() / 1000)
    const tokens = sessions
      .filter((session) => session.expiresAt > now)
      .map((session) => session.expoPushToken)
      .filter((token): token is string => Boolean(token))
    if (tokens.length === 0) return

    await sendPushNotification({
      tokens,
      ...messagePushNotification(message, sender?.username ?? "New message"),
    })
  } catch (error) {
    logger.error("Push notification failed", { error, peerId, senderId })
  }
}

/**
 * A push is only sent when the peer is not viewing this conversation. The
 * conversation channel itself is fanned out by AppSync, so there is no socket
 * registry to consult here.
 */
const notifyPeerIfNotViewing = async ({
  userId,
  conversationId,
  message,
}: {
  userId: UserId
  conversationId: ConversationId
  message: Message
}): Promise<boolean | undefined> => {
  try {
    const peerId = getPeerUserId(conversationId, userId)
    if (!peerId) return

    const peerActiveConversation = await conversationsDao.getUserActiveConversation({
      userId: peerId,
    })
    if (peerActiveConversation === conversationId) return true

    await notifyPeer({ peerId, senderId: userId, message })
    return false
  } catch (error) {
    logger.warn("Peer notification skipped", { error, conversationId })
  }
}

/** Wraps unexpected DAO failures; `ApiException`s pass through untouched. */
const asApiError = (error: unknown, context: string): ApiException => {
  if (error instanceof ApiException) return error
  logger.error(context, { error })
  return new ApiException(500, { message: "Internal error. Please try again." })
}

export const sendMessageService = async ({
  senderId,
  message,
}: {
  senderId: UserId
  message: SendMessageReq
}): Promise<Message> => {
  try {
    assertConversationMember(message.conversationId, senderId)

    if (message.body && message.body.length > MAX_MESSAGE_LENGTH) {
      throw new ApiException(400, {
        message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`,
      })
    }

    const { conversationId, type, body, attachment, replyTo, isForwarded } = message
    const peerId = getPeerUserId(conversationId, senderId)
    if (!peerId) {
      throw new ApiException(400, { message: "Could not resolve the conversation peer" })
    }

    const created = await messagesDao.createMessage({
      conversationId,
      senderId,
      peerId,
      type,
      ...(body ? { body } : {}),
      ...(attachment ? { attachment } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}),
      isForwarded: isForwarded ?? false,
    })

    const isPeerViewingCurrentConversation = await notifyPeerIfNotViewing({
      userId: senderId,
      conversationId,
      message: created,
    })

    const lastMessage = {
      lastMessageAt: created.createdAt,
      lastMessageId: created.messageId,
      lastMessagePreview: messagePreview(created),
    }

    await conversationsDao.updateUserConversationLastMessage({
      senderId,
      conversationId,
      increaseUnread: !isPeerViewingCurrentConversation,
      ...lastMessage,
    })

    logger.info("Message stored", {
      senderId,
      conversationId,
      messageId: created.messageId,
      uid: created.uid,
      type: created.type,
    })

    return created
  } catch (error) {
    logger.error("message.send failed", {
      senderId,
      conversationId: message.conversationId,
      type: message.type,
      error,
    })
    throw asApiError(error, `message.send failed for ${senderId}`)
  }
}

export const editMessageService = async ({
  editorId,
  edit,
}: {
  editorId: UserId
  edit: EditMessageReq
}): Promise<Message> => {
  try {
    assertConversationMember(edit.conversationId, editorId)

    if (edit.body.length > MAX_MESSAGE_LENGTH) {
      throw new ApiException(400, {
        message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`,
      })
    }

    const existing = await messagesDao.getMessageById({
      conversationId: edit.conversationId,
      uid: edit.uid,
    })
    if (!existing || existing.deletedAt) {
      throw new ApiException(404, { message: "Message not found" })
    }
    if (existing.senderId !== editorId) {
      throw new ApiException(403, { message: "You can only edit your own messages" })
    }
    if (Date.now() - existing.createdAt > MESSAGE_ACTION_WINDOW_MS) {
      throw new ApiException(403, {
        code: "EDIT_WINDOW_EXPIRED",
        message: "Messages can only be edited within 15 minutes of sending",
      })
    }

    const updated = await messagesDao.editMessage({
      conversationId: edit.conversationId,
      uid: edit.uid,
      body: edit.body,
    })

    try {
      const member = await conversationsDao
        .getUserConversationMember({ userId: editorId, conversationId: edit.conversationId })
        .catch(() => undefined)

      if (member?.lastMessageId === updated.messageId) {
        await conversationsDao.updateUserConversationLastMessage({
          senderId: editorId,
          conversationId: edit.conversationId,
          increaseUnread: false,
          lastMessageId: updated.messageId,
          lastMessagePreview: messagePreview(updated),
          lastMessageAt: updated.editedAt ?? updated.createdAt,
        })
      }
    } catch (error) {
      logger.warn("Could not update conversation last message on edit", { error })
    }

    return updated
  } catch (error) {
    throw asApiError(error, `message.edit failed for ${editorId}`)
  }
}

export const deleteMessageService = async ({
  deleterId,
  target,
}: {
  deleterId: UserId
  target: DeleteMessageReq
}): Promise<{ uid: MessageUID; messageId: string; conversationId: ConversationId }> => {
  try {
    assertConversationMember(target.conversationId, deleterId)

    const existing = await messagesDao.getMessageById({
      conversationId: target.conversationId,
      uid: target.uid,
    })
    if (!existing) throw new ApiException(404, { message: "Message not found" })
    if (existing.deletedAt) {
      return {
        conversationId: target.conversationId,
        uid: existing.uid,
        messageId: existing.messageId,
      }
    }
    if (existing.senderId !== deleterId) {
      throw new ApiException(403, { message: "You can only delete your own messages" })
    }

    const updated = await messagesDao.deleteMessage({
      conversationId: target.conversationId,
      uid: target.uid,
    })

    try {
      const member = await conversationsDao
        .getUserConversationMember({ userId: deleterId, conversationId: target.conversationId })
        .catch(() => undefined)

      if (member?.lastMessageId === updated.messageId) {
        const peerId = getPeerUserId(target.conversationId, deleterId)
        const peerActive = peerId
          ? await conversationsDao
              .getUserActiveConversation({ userId: peerId })
              .catch(() => undefined)
          : undefined

        await conversationsDao.updateUserConversationLastMessage({
          senderId: deleterId,
          conversationId: target.conversationId,
          increaseUnread: peerActive !== target.conversationId,
          lastMessageId: updated.messageId,
          lastMessagePreview: "Message deleted",
          lastMessageAt: Date.now(),
        })
      }
    } catch (error) {
      logger.warn("Could not update conversation last message on delete", { error })
    }

    return {
      conversationId: target.conversationId,
      uid: updated.uid,
      messageId: updated.messageId,
    }
  } catch (error) {
    throw asApiError(error, `message.delete failed for ${deleterId}`)
  }
}
