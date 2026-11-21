import { conversationsDao, messagesDao, usersDao } from "@repo/api/dao"
import { messagePushNotification, sendPushNotification } from "@repo/api/notifications"
import { ApiException, AWSManager, parseConversationId, parseOrThrow } from "@repo/api/utils"
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_ACTION_WINDOW_MS,
  getPeerUserId,
  messagePreview,
  type ConversationId,
  type Message,
  type MessageId,
  type UserId,
} from "@repo/types/schema"
import type { DeleteMessageReq, EditMessageReq, SendMessageReq } from "@repo/types/req"

const { logger } = AWSManager

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
    await assertConversationAccess({ userId: senderId, conversationId: message.conversationId })

    if (message.body && message.body.length > MAX_MESSAGE_LENGTH) {
      throw new ApiException(400, {
        message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`,
      })
    }

    const { conversationId, type, body, attachment } = message
    const created = await messagesDao.createMessage({
      conversationId,
      type,
      ...(body ? { body } : {}),
      ...(attachment ? { attachment } : {}),
      senderId,
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
    await assertConversationAccess({ userId: editorId, conversationId: edit.conversationId })

    if (edit.body.length > MAX_MESSAGE_LENGTH) {
      throw new ApiException(400, {
        message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`,
      })
    }

    const existing = await messagesDao.getMessageById(edit)
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
    if (existing.createdAt > Date.now() - 15 * 60) {
      throw new ApiException(403, { message: "Can only edit messages withing 15 min." })
    }

    await messagesDao.editMessage({
      conversationId: edit.conversationId,
      messageId: edit.messageId,
      body: edit.body,
    })

    const updated = await messagesDao.getMessageById(edit)
    if (!updated) throw new ApiException(404, { message: "Message not found" })

    try {
      const member = await conversationsDao
        .getUserConversationMember({ userId: editorId, conversationId: edit.conversationId })
        .catch(() => undefined)

      if (member?.lastMessageId === edit.messageId) {
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
}): Promise<{ messageId: MessageId; conversationId: ConversationId }> => {
  try {
    await assertConversationAccess({ userId: deleterId, conversationId: target.conversationId })

    const existing = await messagesDao.getMessageById(target)
    if (!existing) throw new ApiException(404, { message: "Message not found" })
    if (existing.deletedAt) {
      return { conversationId: target.conversationId, messageId: target.messageId }
    }
    if (existing.senderId !== deleterId) {
      throw new ApiException(403, { message: "You can only delete your own messages" })
    }

    await messagesDao.deleteMessage({
      conversationId: target.conversationId,
      messageId: target.messageId,
    })

    try {
      const member = await conversationsDao
        .getUserConversationMember({ userId: deleterId, conversationId: target.conversationId })
        .catch(() => undefined)

      if (member?.lastMessageId === target.messageId) {
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
          lastMessageId: target.messageId,
          lastMessagePreview: "Message deleted",
          lastMessageAt: Date.now(),
        })
      }
    } catch (error) {
      logger.warn("Could not update conversation last message on delete", { error })
    }

    return { conversationId: target.conversationId, messageId: target.messageId }
  } catch (error) {
    throw asApiError(error, `message.delete failed for ${deleterId}`)
  }
}
