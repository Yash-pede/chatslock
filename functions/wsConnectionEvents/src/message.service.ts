import { conversationsDao, messagesDao, usersDao } from "@repo/api/dao"
import { GoneException } from "@aws-sdk/client-apigatewaymanagementapi"
import { ApiException, parseConversationId, parseOrThrow } from "@repo/api/utils"
import {
  messageCreatedEventSchema,
  messageDeletedEventSchema,
  messageUpdatedEventSchema,
  WS_MESSAGE_EVENT_TYPE,
  type ConversationId,
  type ConversationType,
  type Message,
  type MessageId,
  type UserId,
} from "@repo/types/schema"
import type {
  DeleteMessageData,
  EditMessageData,
  ListMessageData,
  SendMessageData,
} from "@repo/types/req"

type PostToConnection = (connectionId: string, body: unknown) => Promise<void>

/** Splits `TYPE#id`; a malformed id is a client error. */
const conversationRef = (
  conversationId: ConversationId,
): { type: ConversationType; conversationId: string } => {
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
 * Sends to one socket, pruning it when API Gateway reports 410 Gone (the
 * client disconnected without `$disconnect` reaching us). Other failures are
 * logged so one bad socket cannot fail the sender's request.
 */
const deliver = async ({
  userId,
  connectionId,
  payload,
  postToConnection,
}: {
  userId: UserId
  connectionId: string
  payload: unknown
  postToConnection: PostToConnection
}): Promise<void> => {
  try {
    await postToConnection(connectionId, payload)
  } catch (error) {
    if (error instanceof GoneException || (error as { name?: string })?.name === "GoneException") {
      await usersDao.deleteUserConnection({ userId, connectionId })
      return
    }
    console.error(`fan-out to ${connectionId} failed`, error)
  }
}

/**
 * Pushes an event to every open socket of the other participant(s), read from
 * the conversation id. The sender is excluded: their confirmation is the ack.
 */
const fanOut = async ({
  userId,
  conversationId,
  payload,
  postToConnection,
}: {
  userId: UserId
  conversationId: ConversationId
  payload: unknown
  postToConnection: PostToConnection
}): Promise<void> => {
  const peerIds = conversationRef(conversationId)
    .conversationId.split("#")
    .filter((id) => id !== userId)

  const peers = await Promise.all(
    peerIds.map(async (peer) => ({
      userId: peer,
      connectionIds: await usersDao.getUserConnections({ userId: peer }),
    })),
  )

  await Promise.all(
    peers.flatMap(({ userId: peer, connectionIds }) =>
      connectionIds.map((connectionId) =>
        deliver({ userId: peer, connectionId, payload, postToConnection }),
      ),
    ),
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

    const { conversationId, type, body, attachment } = message
    // `TEXT` always has a body (schema-checked); only non-text types may carry
    // an attachment, so these never both appear on the DAO input.
    const created = await messagesDao.createMessage({
      conversationId,
      type,
      ...(body ? { body } : {}),
      ...(attachment ? { attachment } : {}),
      senderId,
    })

    await fanOut({
      userId: senderId,
      conversationId: message.conversationId,
      payload: parseOrThrow(messageCreatedEventSchema, {
        type: WS_MESSAGE_EVENT_TYPE.created,
        message: created,
      }),
      postToConnection,
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

    await fanOut({
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

    await fanOut({
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
