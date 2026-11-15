import { BatchWriteCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb"
import {
  CONVERSATION_SK,
  conversationItem,
  conversationSchema,
  PREFIXES,
  TABLE_NAME,
  userMember_conversationItem,
  userMember_conversationSchema,
  type ConversationId,
  type UserMemberConversation,
  type UserId,
} from "@repo/types/schema"
import {
  AWSManager,
  buildKey,
  buildConversationId,
  parseConversationId,
  parseOrThrow,
  parseConversationKey,
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
                }),
              },
            })),
          ],
        },
      }),
    )
  },
  getConversationsByUserId: async (id: UserId): Promise<Array<UserMemberConversation>> => {
    const resp = await AWSManager.dbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
        ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK" },
        ExpressionAttributeValues: {
          ":pk": buildKey(PREFIXES.USER, id),
          ":sk": PREFIXES.CONVERSATION,
        },
      }),
    )
    return (resp.Items ?? []).map((item) => {
      const stored = parseOrThrow(userMember_conversationItem, item)
      const { type, conversationId } = parseConversationKey(stored.SK)
      return parseOrThrow(userMember_conversationSchema, {
        ...stored,
        conversationType: type,
        conversationId: buildConversationId(type, conversationId),
      })
    })
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
