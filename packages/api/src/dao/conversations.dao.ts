import {
  BatchWriteCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb"
import {
  CONVERSATIONS_MEMBERLIST_GSI,
  CONVERSATION_SK,
  conversationItem,
  conversationSchema,
  PREFIXES,
  TABLE_NAME,
  userMember_conversationItem,
  userMember_conversationSchema,
  getPeerUserId,
  type ConversationId,
  type UserMemberConversation,
  type UserId,
  UpdateConversation,
  MessageId,
} from "@repo/types/schema"
import {
  AWSManager,
  buildKey,
  buildConversationId,
  decodeLastEvaluatedKey,
  parseConversationId,
  parseOrThrow,
  parseConversationKey,
  definedEntries,
} from "../utils"

export const conversationsDao = {
  createDirectConversation: async (userIds: [UserId, UserId]): Promise<void> => {
    const now = Date.now()
    const type = "DIRECT" as const
    const sorted = [...userIds].sort()
    const first = sorted[0]!
    const second = sorted[1]!
    const conversationId = buildConversationId(type, `${first}#${second}`)

    await AWSManager.dbClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: [
            {
              PutRequest: {
                Item: parseOrThrow(conversationItem, {
                  PK: buildKey(PREFIXES.CONVERSATION, type, first, second),
                  SK: CONVERSATION_SK[0],
                  conversationId,
                  conversationType: type,
                  createdAt: now,
                  updatedAt: now,
                }),
              },
            },
            ...userIds.map((id) => ({
              PutRequest: {
                Item: parseOrThrow(userMember_conversationItem, {
                  PK: buildKey(PREFIXES.USER, id),
                  SK: buildKey(PREFIXES.CONVERSATION, type, first, second),
                  userMember: buildKey(PREFIXES.MEMBER, id),
                  unreadCount: 0,
                  lastMessageAt: now,
                }),
              },
            })),
          ],
        },
      }),
    )
  },
  getConversationsByUserId: async (
    id: UserId,
    pageSize: number,
    startKey?: string,
  ): Promise<{
    conversations: Array<UserMemberConversation>
    lastEvaluatedKey?: Record<string, unknown>
  }> => {
    const resp = await AWSManager.dbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: CONVERSATIONS_MEMBERLIST_GSI,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": "PK" },
        ExpressionAttributeValues: {
          ":pk": buildKey(PREFIXES.USER, id),
        },
        ExclusiveStartKey: decodeLastEvaluatedKey(startKey),
        ScanIndexForward: false,
        Limit: pageSize,
      }),
    )

    const conversations = (resp.Items ?? []).map((item) => {
      const stored = parseOrThrow(userMember_conversationItem, item)
      const { type, conversationId } = parseConversationKey(stored.SK)
      return parseOrThrow(userMember_conversationSchema, {
        ...stored,
        conversationType: type,
        conversationId: buildConversationId(type, conversationId),
      })
    })

    return { conversations, lastEvaluatedKey: resp.LastEvaluatedKey }
  },
  /** Conversation metadata (type + createdAt), or `undefined` if it is gone. */
  getConversation: async (conversationId: ConversationId) => {
    parseConversationId(conversationId)

    const resp = await AWSManager.dbClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `${PREFIXES.CONVERSATION}${conversationId}`,
          SK: CONVERSATION_SK[0],
        },
      }),
    )

    return resp.Item ? parseOrThrow(conversationSchema, resp.Item) : undefined
  },

  updateConversation: async (input: UpdateConversation) => {
    parseConversationId(input.conversationId)
    const attributes = definedEntries(input, ["conversationId"])
    const sets = attributes.map(([field]) => `#${field} = :${field}`)

    return AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `${PREFIXES.CONVERSATION}${input.conversationId}`,
          SK: CONVERSATION_SK[0],
        },
        UpdateExpression: `SET ${sets.map((set, index) => (index === 0 ? `${set}` : `, ${set}`)).join("")}`,
        ExpressionAttributeNames: {
          // "#updatedAt": "updatedAt",
          ...Object.fromEntries(attributes.map(([field]) => [`#${field}`, field])),
        },
        ExpressionAttributeValues: {
          // ":updatedAt": Date.now(),
          ...Object.fromEntries(attributes.map(([field, value]) => [`:${field}`, value])),
        },
      }),
    )
  },
  updateUserConversationLastMessage: async (input: {
    senderId: UserId
    increaseUnread: boolean
    lastMessageId: MessageId
    lastMessagePreview: string
    lastMessageAt: number
    conversationId: string
  }) => {
    parseConversationId(input.conversationId)

    const sk = `${PREFIXES.CONVERSATION}${input.conversationId}`
    const peerId = getPeerUserId(input.conversationId, input.senderId)

    const lastMessageSet =
      "SET #lastMessageId = :lastMessageId, #lastMessagePreview = :lastMessagePreview, #lastMessageAt = :lastMessageAt"
    const lastMessageNames = {
      "#lastMessageId": "lastMessageId",
      "#lastMessagePreview": "lastMessagePreview",
      "#lastMessageAt": "lastMessageAt",
    }
    const lastMessageValues = {
      ":lastMessageId": input.lastMessageId,
      ":lastMessagePreview": input.lastMessagePreview,
      ":lastMessageAt": input.lastMessageAt,
    }

    const updates = [
      {
        Update: {
          TableName: TABLE_NAME,
          Key: {
            PK: buildKey(PREFIXES.USER, input.senderId),
            SK: sk,
          },
          UpdateExpression: lastMessageSet,
          ExpressionAttributeNames: lastMessageNames,
          ExpressionAttributeValues: lastMessageValues,
        },
      },
    ]

    if (peerId) {
      updates.push({
        Update: {
          TableName: TABLE_NAME,
          Key: {
            PK: buildKey(PREFIXES.USER, peerId),
            SK: sk,
          },
          UpdateExpression: `${input.increaseUnread ? "ADD #unreadCount :one " : ""}${lastMessageSet}`,
          ExpressionAttributeNames: {
            ...lastMessageNames,
            ...(input.increaseUnread ? { "#unreadCount": "unreadCount" } : {}),
          },
          ExpressionAttributeValues: {
            ...lastMessageValues,
            ...(input.increaseUnread ? { ":one": 1 } : {}),
          },
        },
      })
    }

    return AWSManager.dbClient.send(new TransactWriteCommand({ TransactItems: updates }))
  },

  resetUserConversationUnreadCount: async (input: {
    userId: UserId
    conversationId: ConversationId
  }) => {
    parseConversationId(input.conversationId)
    return await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: buildKey(PREFIXES.USER, input.userId),
          SK: `${PREFIXES.CONVERSATION}${input.conversationId}`,
        },
        UpdateExpression: "SET #unreadCount = :unreadCount",
        ExpressionAttributeNames: { "#unreadCount": "unreadCount" },
        ExpressionAttributeValues: { ":unreadCount": 0 },
      }),
    )
  },

  /**
   * The caller's membership row for one conversation, or `undefined` when the
   * conversation does not exist or the caller is not a participant. This is the
   * authorization source for realtime channels.
   */
  getUserConversationMember: async (input: { userId: UserId; conversationId: ConversationId }) => {
    parseConversationId(input.conversationId)

    const resp = await AWSManager.dbClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: buildKey(PREFIXES.USER, input.userId),
          SK: `${PREFIXES.CONVERSATION}${input.conversationId}`,
        },
      }),
    )

    return resp.Item ? parseOrThrow(userMember_conversationItem, resp.Item) : undefined
  },

  /** Viewing a conversation clears the caller's unread count. */
  resetUserConversationUnread: async (input: {
    userId: UserId
    conversationId: ConversationId
  }) => {
    parseConversationId(input.conversationId)

    return AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: buildKey(PREFIXES.USER, input.userId),
          SK: `${PREFIXES.CONVERSATION}${input.conversationId}`,
        },
        UpdateExpression: "SET #unreadCount = :zero",
        ExpressionAttributeNames: { "#unreadCount": "unreadCount" },
        ExpressionAttributeValues: { ":zero": 0 },
      }),
    )
  },

  /** True when the two users have a DIRECT conversation (2 ids sorted in the key). */
  hasDirectConversationWith: async (input: {
    userId: UserId
    otherUserId: UserId
  }): Promise<boolean> => {
    const [first, second] = [input.userId, input.otherUserId].sort()
    const resp = await AWSManager.dbClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: buildKey(PREFIXES.USER, input.userId),
          SK: buildKey(PREFIXES.CONVERSATION, "DIRECT", first!, second!),
        },
      }),
    )

    return Boolean(resp.Item)
  },

  setUserActiveConversation: async ({
    userId,
    conversationId,
  }: {
    userId: string
    conversationId: ConversationId
  }) => {
    return (await AWSManager.cacheClient()).set(
      buildKey(PREFIXES.USER, userId, "ACTIVECONV"),
      conversationId,
      "EX",
      10 * 60, //10 min opne conv
    )
  },
  getUserActiveConversation: async ({ userId }: { userId: string }) => {
    return await (await AWSManager.cacheClient()).get(buildKey(PREFIXES.USER, userId, "ACTIVECONV"))
  },
  deleteUserActiveConversation: async ({ userId }: { userId: string }) => {
    return (await AWSManager.cacheClient()).del(buildKey(PREFIXES.USER, userId, "ACTIVECONV"))
  },
}
