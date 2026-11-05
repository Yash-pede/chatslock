import { conversationsDao, messagesDao, usersDao } from "@repo/api/dao"
import { messagePushNotification, sendPushNotification } from "@repo/api/notifications"
import { ApiException, parseConversationId, parseOrThrow } from "@repo/api/utils"
import {
  MAX_MESSAGE_LENGTH,
  messageCreatedEventSchema,
  messageDeletedEventSchema,
  messageUpdatedEventSchema,
  WS_MESSAGE_EVENT_TYPE,
  type ConversationId,
  type DeleteMessageData,
  type EditMessageData,
  type ListMessageData,
  type Message,
  type MessageId,
  type SendMessageData,
  type UserId,
} from "@repo/types/schema"

type PostToConnection = (connectionId: string, body: unknown) => Promise<void>

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
        console.warn("[ws] could not load sender for notification", error)
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
    console.error("[ws] push notification failed", error)
  }
}

/**
 * Pushes an event to every open socket of the other participant(s), read from
 * the conversation id. The sender is excluded: their confirmation is the ack.
 * If the peer has no open socket, a new message also goes out as a push.
 */
const deliverMessageToPeer = async ({
  userId,
  conversationId,
  payload,
  postToConnection,
  notifyMessage,
}: {
  userId: UserId
  conversationId: ConversationId
  payload: unknown
  postToConnection: PostToConnection
  /** Set only for a newly created message; edits/deletes do not notify. */
  notifyMessage?: Message
}): Promise<void> => {
  const peerId = parseConversationId(conversationId)
    .conversationId.split("#")
    .find((id) => id !== userId)

  if (!peerId) return

  const [peersConnectionIds, peerActiveConversation] = await Promise.all([
    usersDao.getUserConnections({ userId: peerId }),
    conversationsDao.getUserActiveConversation({ userId: peerId }),
  ])

  if (peerActiveConversation != conversationId && notifyMessage) {
    await notifyPeer({ peerId, senderId: userId, message: notifyMessage })
  }

  await Promise.all(
    peersConnectionIds.map((connectionId) => postToConnection(connectionId, payload)),
  )
}

/** Wraps unexpected DAO failures; `ApiException`s pass through untouched. */
const asApiError = (error: unknown, context: string): ApiException => {
  if (error instanceof ApiException) return error
  console.error(context, error)
  return new ApiException(500, { message: "Internal error. Please try again." })
}

export const sendMessageService = async ({
  senderId,
  message,
  postToConnection,
}: {
  senderId: UserId
  message: SendMessageData
  postToConnection: PostToConnection
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

    await deliverMessageToPeer({
      userId: senderId,
      conversationId: message.conversationId,
      payload: parseOrThrow(messageCreatedEventSchema, {
        type: WS_MESSAGE_EVENT_TYPE.created,
        message: created,
      }),
      postToConnection,
      notifyMessage: created,
    })

    console.log("[ws] message.send stored", {
      senderId,
      conversationId,
      messageId: created.messageId,
      type: created.type,
    })

    return created
  } catch (error) {
    // The full cause is logged: a validation error from the DAO otherwise
    // reaches the client as an opaque "Internal error".
    console.error("[ws] message.send failed", {
      senderId,
      conversationId: message.conversationId,
      type: message.type,
      error: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error ? (error.cause as Error | undefined)?.message : undefined,
    })
    throw asApiError(error, `message.send failed for ${senderId}`)
  }
}

export const editMessageService = async ({
  editorId,
  edit,
  postToConnection,
}: {
  editorId: UserId
  edit: EditMessageData
  postToConnection: PostToConnection
}): Promise<Message> => {
  try {
    await assertConversationAccess({ userId: editorId, conversationId: edit.conversationId })

    if (edit.body.length > MAX_MESSAGE_LENGTH) {
      throw new ApiException(400, {
        message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`,
      })
    }

    const existing = await messagesDao.getMessageById(edit)
    if (!existing) throw new ApiException(404, { message: "Message not found" })
    if (existing.senderId !== editorId) {
      throw new ApiException(403, { message: "You can only edit your own messages" })
    }

    await messagesDao.editMessage({
      conversationId: edit.conversationId,
      messageId: edit.messageId,
      body: edit.body,
    })

    const updated = await messagesDao.getMessageById(edit)
    if (!updated) throw new ApiException(404, { message: "Message not found" })

    await deliverMessageToPeer({
      userId: editorId,
      conversationId: edit.conversationId,
      payload: parseOrThrow(messageUpdatedEventSchema, {
        type: WS_MESSAGE_EVENT_TYPE.updated,
        message: updated,
      }),
      postToConnection,
    })

    return updated
  } catch (error) {
    throw asApiError(error, `message.edit failed for ${editorId}`)
  }
}

export const deleteMessageService = async ({
  deleterId,
  target,
  postToConnection,
}: {
  deleterId: UserId
  target: DeleteMessageData
  postToConnection: PostToConnection
}): Promise<{ messageId: MessageId; conversationId: ConversationId; deletedAt: number }> => {
  try {
    await assertConversationAccess({ userId: deleterId, conversationId: target.conversationId })

    const existing = await messagesDao.getMessageById(target)
    if (!existing) throw new ApiException(404, { message: "Message not found" })
    if (existing.senderId !== deleterId) {
      throw new ApiException(403, { message: "You can only delete your own messages" })
    }

    await messagesDao.deleteMessage({
      conversationId: target.conversationId,
      messageId: target.messageId,
    })
    const deletedAt = Date.now()

    await deliverMessageToPeer({
      userId: deleterId,
      conversationId: target.conversationId,
      payload: parseOrThrow(messageDeletedEventSchema, {
        type: WS_MESSAGE_EVENT_TYPE.deleted,
        conversationId: target.conversationId,
        messageId: target.messageId,
        deletedAt,
      }),
      postToConnection,
    })

    return { conversationId: target.conversationId, messageId: target.messageId, deletedAt }
  } catch (error) {
    throw asApiError(error, `message.delete failed for ${deleterId}`)
  }
}

export const listMessagesService = async ({
  userId,
  list,
}: {
  userId: UserId
  list: ListMessageData
}): Promise<{ messages: Message[]; nextCursor?: string }> => {
  try {
    await assertConversationAccess({ userId, conversationId: list.conversationId })

    const messages = await messagesDao.getMessagesByConversationId({
      conversationId: list.conversationId,
      ...(list.cursor ? { cursor: list.cursor } : {}),
      limit: list.limit,
    })

    const oldest = messages.at(-1)
    return {
      messages,
      nextCursor: messages.length === list.limit && oldest ? oldest.messageId : undefined,
    }
  } catch (error) {
    throw asApiError(error, `message.list failed for ${userId}`)
  }
}

export const readMessageService = async ({
  userId,
  conversationId,
}: {
  userId: UserId
  conversationId: ConversationId
}): Promise<void> => {
  try {
    await assertConversationAccess({ userId, conversationId })
    // The composite id is the membership row's sort key minus the
    // CONVERSATION# prefix — the DAO writes exactly that key.
    await conversationsDao.markConversationRead({ userId, conversationId })
  } catch (error) {
    throw asApiError(error, `message.read failed for ${userId}`)
  }
}
