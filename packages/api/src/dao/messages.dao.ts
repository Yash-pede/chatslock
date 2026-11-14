import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import {
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

const messageKey = (conversationId: ConversationId, messageId: MessageId) => ({
  PK: conversationPk(conversationId),
  SK: buildKey(MESSAGE_SK_PREFIX, messageId),
})

/**
 * Messages expire after 30 days. DynamoDB TTL is epoch **seconds**, so the
 * expiry is derived from `Math.floor(now / 1000)` and not from `Date.now()`.
 */
const MESSAGE_TTL_SECONDS = 30 * 24 * 60 * 60

/** Hide rows past their TTL until the asynchronous sweep removes them. */
const notExpired = "(attribute_not_exists(expiresAt) OR expiresAt > :now)"

export const messagesDao = {
  createMessage: async (input: CreateMessageInput): Promise<Message> => {
    const data = parseOrThrow(createMessageSchema, input)
    const now = Date.now()
    const messageId = generateUlid(now)

    const item = parseOrThrow(messageItem, {
      ...messageKey(data.conversationId, messageId),
      messageId,
      conversationId: data.conversationId,
      senderId: data.senderId,
      type: data.type,
      body: data.body,
      attachment: data.attachment,
      createdAt: now,
      updatedAt: now,
      expiresAt: Math.floor(now / 1000) + MESSAGE_TTL_SECONDS,
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
    messageId: MessageId
  }): Promise<Message | undefined> => {
    const result = await AWSManager.dbClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: messageKey(input.conversationId, input.messageId),
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
  /** Newest page of messages for a conversation, in chronological (ULID) order. */
  getMessagesByConversationId: async (input: {
    conversationId: ConversationId
    limit: number
    includeDeleted?: false
    cursor?: MessageId
  }): Promise<Message[]> => {
    const result = await AWSManager.dbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
        FilterExpression: input.includeDeleted
          ? notExpired
          : `attribute_not_exists(deletedAt) AND ${notExpired}`,
        ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK" },
        ExpressionAttributeValues: {
          ":pk": conversationPk(input.conversationId),
          ":sk": MESSAGE_SK_PREFIX,
          ":now": Math.floor(Date.now() / 1000),
        },
        ScanIndexForward: false,
        ExclusiveStartKey: input.cursor
          ? messageKey(input.conversationId, input.cursor)
          : undefined,
        Limit: input.limit,
      }),
    )

    return (result.Items ?? []).map((item) => parseOrThrow(messageSchema, item))
  },
  editMessage: async (input: EditMessageInput): Promise<void> => {
    const data = parseOrThrow(editMessageSchema, input)
    const now = Date.now()

    await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: messageKey(data.conversationId, data.messageId),
        UpdateExpression: "SET #body = :body, #updatedAt = :updatedAt, #editedAt = :editedAt",
        ConditionExpression: "attribute_exists(PK) AND #type = :text",
        ExpressionAttributeNames: {
          "#body": "body",
          "#updatedAt": "updatedAt",
          "#editedAt": "editedAt",
          "#type": "type",
        },
        ExpressionAttributeValues: {
          ":body": data.body,
          ":updatedAt": now,
          ":editedAt": now,
          ":text": MESSAGE_TYPE[0],
        },
      }),
    )
  },
  /** Soft-delete: the row keeps its sort-key position so page cursors stay valid. */
  deleteMessage: async (input: DeleteMessageInput): Promise<void> => {
    const data = parseOrThrow(deleteMessageSchema, input)
    const now = Date.now()

    await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: messageKey(data.conversationId, data.messageId),
        UpdateExpression: "SET #deletedAt = :deletedAt, #updatedAt = :updatedAt",
        ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(#deletedAt)",
        ExpressionAttributeNames: {
          "#deletedAt": "deletedAt",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":deletedAt": now,
          ":updatedAt": now,
        },
      }),
    )
  },
}
