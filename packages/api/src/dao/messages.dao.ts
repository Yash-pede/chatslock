import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import {
  MESSAGE_ID_SEQUENCE_GSI,
  MESSAGE_SK_PREFIX,
  MESSAGE_TYPE,
  PREFIXES,
  TABLE_NAME,
  compositeConversationIdPattern,
  createMessageSchema,
  deleteMessageSchema,
  editMessageSchema,
  messageItem,
  messageSchema,
  type ConversationId,
  type CreateMessageInput,
  type DeleteMessageInput,
  type EditMessageInput,
  type Message,
  type MessageId,
  type MessageUID,
} from "@repo/types/schema"
import { AWSManager, buildKey, generateUlid, parseOrThrow } from "../utils"

/**
 * Key of a message item. The composite conversation id (`TYPE#id`) is the
 * conversation key minus the storage prefix, so the partition is simply
 * `CONVERSATION#` + the id the client sends.
 */
const conversationPk = (conversationId: ConversationId) => {
  if (!compositeConversationIdPattern.test(conversationId)) {
    throw new Error(`Invalid conversation id "${conversationId}"`)
  }
  return `${PREFIXES.CONVERSATION}${conversationId}`
}

const messageKey = (conversationId: ConversationId, uid: MessageUID) => ({
  PK: conversationPk(conversationId),
  SK: buildKey(MESSAGE_SK_PREFIX, uid),
})

/**
 * Messages expire after 30 days. DynamoDB TTL is epoch **seconds**, so the
 * expiry is derived from `Math.floor(now / 1000)` and not from `Date.now()`.
 */
const MESSAGE_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Sort key and attribute of the per-conversation sequence counter. It shares the
 * conversation partition but is not a message, and the value lives under
 * `messageSequence` (never `messageId`) so the MessageIdSequence_GSI — which
 * ranges on `messageId` — does not project it; no `expiresAt` means TTL skips it.
 */
const MESSAGE_SEQUENCE_SK = "SEQUENCE"
const MESSAGE_SEQUENCE_ATTRIBUTE = "messageSequence"

const messageSequenceKey = (conversationId: ConversationId) => ({
  PK: conversationPk(conversationId),
  SK: MESSAGE_SEQUENCE_SK,
})

const nextMessageSequence = async (conversationId: ConversationId): Promise<number> => {
  const result = await AWSManager.dbClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: messageSequenceKey(conversationId),
      UpdateExpression: "ADD #messageSequence :inc",
      ExpressionAttributeNames: { "#messageSequence": MESSAGE_SEQUENCE_ATTRIBUTE },
      ExpressionAttributeValues: { ":inc": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  )

  const messageId = Number(result.Attributes?.[MESSAGE_SEQUENCE_ATTRIBUTE])
  if (!Number.isInteger(messageId) || messageId < 1) {
    throw new Error("Could not allocate a message sequence")
  }
  return messageId
}

export const messagesDao = {
  createMessage: async (input: CreateMessageInput): Promise<Message> => {
    const data = parseOrThrow(createMessageSchema, input)
    const now = Date.now()
    const uid = generateUlid(now)

    // Allocate the sequence just before the write; `messageId` is written
    // explicitly instead of relying on `ADD` on the (always new) message item.
    const messageId = await nextMessageSequence(data.conversationId)

    const item = parseOrThrow(messageItem, {
      ...messageKey(data.conversationId, uid),
      uid,
      messageId,
      conversationId: data.conversationId,
      senderId: data.senderId,
      peerId: data.peerId,
      type: data.type,
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.attachment !== undefined ? { attachment: data.attachment } : {}),
      ...(data.replyTo !== undefined ? { replyTo: data.replyTo } : {}),
      isForwarded: data.isForwarded,
      createdAt: now,
      expiresAt: Math.floor(now / 1000) + MESSAGE_TTL_SECONDS,
      version: 1,
    })

    await AWSManager.dbClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    )

    return parseOrThrow(messageSchema, item)
  },
  getMessageById: async (input: {
    conversationId: ConversationId
    uid: MessageUID
  }): Promise<Message | undefined> => {
    const result = await AWSManager.dbClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: messageKey(input.conversationId, input.uid),
      }),
    )

    const item = result.Item
    if (item === undefined) return undefined

    // TTL deletion is asynchronous; hide rows whose 30 days elapsed already.
    if (typeof item.expiresAt === "number" && item.expiresAt <= Math.floor(Date.now() / 1000)) {
      return undefined
    }

    return parseOrThrow(messageSchema, item)
  },
  /**
   * Newest page of a conversation by numeric message sequence (`messageId`),
   * descending. The cursor is the sequence string from the client; the GSI
   * range key is numeric, so it is converted here (and only here).
   */
  getMessagesByConversationId: async (input: {
    conversationId: ConversationId
    limit: number
    cursor?: MessageId
  }): Promise<Message[]> => {
    const hasCursor = input.cursor !== undefined

    const result = await AWSManager.dbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: MESSAGE_ID_SEQUENCE_GSI,
        KeyConditionExpression: hasCursor ? "#pk = :pk AND #messageId < :cursor" : "#pk = :pk",
        ExpressionAttributeNames: {
          "#pk": "PK",
          ...(hasCursor ? { "#messageId": "messageId" } : {}),
        },
        ExpressionAttributeValues: {
          ":pk": conversationPk(input.conversationId),
          ...(hasCursor ? { ":cursor": Number(input.cursor) } : {}),
        },
        ScanIndexForward: false,
        Limit: input.limit,
      }),
    )

    return (result.Items ?? []).map((item) => parseOrThrow(messageSchema, item))
  },
  editMessage: async (input: EditMessageInput): Promise<Message> => {
    const data = parseOrThrow(editMessageSchema, input)
    const now = Date.now()

    const newMessage = await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: messageKey(data.conversationId, data.uid),
        UpdateExpression: "SET #body = :body, #editedAt = :editedAt ADD #version :inc",
        ConditionExpression: "attribute_exists(PK) AND #type = :text",
        ExpressionAttributeNames: {
          "#body": "body",
          "#editedAt": "editedAt",
          "#type": "type",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":body": data.body,
          ":editedAt": now,
          ":text": MESSAGE_TYPE[0],
          ":inc": 1,
        },
        ReturnValues: "ALL_NEW",
      }),
    )
    return parseOrThrow(messageSchema, newMessage.Attributes)
  },
  /** Soft-delete: the row keeps its sequence so page cursors stay valid. */
  deleteMessage: async (input: DeleteMessageInput): Promise<Message> => {
    const data = parseOrThrow(deleteMessageSchema, input)
    const now = Date.now()

    const newMessage = await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: messageKey(data.conversationId, data.uid),
        UpdateExpression: "SET #deletedAt = :deletedAt REMOVE attachment, body ADD #version :inc",
        ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(#deletedAt)",
        ExpressionAttributeNames: {
          "#deletedAt": "deletedAt",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":deletedAt": now,
          ":inc": 1,
        },
        ReturnValues: "ALL_NEW",
      }),
    )
    return parseOrThrow(messageSchema, newMessage.Attributes)
  },
}
