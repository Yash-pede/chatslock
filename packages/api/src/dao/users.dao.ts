import {
  BatchGetCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb"
import {
  createUserSchema,
  PREFIXES,
  TABLE_NAME,
  updateUserSchema,
  userItem,
  conversationUserProfileSchema,
  userSchema,
  USERNAME_GSI,
  getUserSchema,
  AUTH_SESSION_PREFIX,
  SESSION_TTL_SECONDS,
  type CreateUserInput,
  type UpdateUserInput,
  type ConversationUserProfile,
  type UserId,
  usersk,
  UserSK,
  authSessionItem,
  authSessionSchema,
  type AuthSession,
} from "@repo/types/schema"
import { MAX_PROFILE_LOOKUP, PeerUserStatus } from "@repo/types/req"
import z from "zod"
import { AWSManager, buildKey, definedEntries, parseOrThrow } from "../utils"
import { conversationsDao } from "./conversations.dao"

const userKey = (userId: UserId, sk?: UserSK) => ({
  PK: buildKey(PREFIXES.USER, userId),
  SK: sk ? sk : usersk.PROFILE,
})

const authSessionKey = (userId: UserId, sessionId: string) => ({
  PK: buildKey(PREFIXES.USER, userId),
  SK: `${AUTH_SESSION_PREFIX}${sessionId}`,
})

export const usersDao = {
  getUserById: async (input: {
    userId: UserId
  }): Promise<z.infer<typeof getUserSchema> | undefined> => {
    const result = await AWSManager.dbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#pk = :pk AND #sk = :sk",
        ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK" },
        ExpressionAttributeValues: {
          ":pk": buildKey(PREFIXES.USER, input.userId),
          ":sk": usersk.PROFILE,
        },
      }),
    )

    const item = result.Items?.[0]
    return item === undefined ? undefined : parseOrThrow(getUserSchema, item)
  },
  /**
   * Fetch the public profile of several users in one call. BatchGet caps at
   * 100 keys, so callers stay far below that (the chat page asks for <= 25).
   * Missing ids are simply absent from the result.
   */
  getPublicProfilesByIds: async (input: {
    userIds: UserId[]
  }): Promise<ConversationUserProfile[]> => {
    const ids = [...new Set(input.userIds)].slice(0, MAX_PROFILE_LOOKUP)
    if (ids.length === 0) return []

    const result = await AWSManager.dbClient.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: ids.map((id) => userKey(id)),
            ProjectionExpression: "userId, username, fullName, avatar, lastActiveAt",
          },
        },
      }),
    )

    const items = result.Responses?.[TABLE_NAME] ?? []
    return items.map((item) => parseOrThrow(conversationUserProfileSchema, item))
  },
  getUserByUsername: async (input: { username: string }) => {
    const result = await AWSManager.dbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: USERNAME_GSI,

        KeyConditionExpression: "#sk = :sk AND #username = :username",
        ExpressionAttributeNames: {
          "#sk": "SK",
          "#username": "username",
        },
        ExpressionAttributeValues: {
          ":sk": usersk.PROFILE,
          ":username": input.username.toLowerCase(),
        },
      }),
    )

    return result.Items?.map((item) => parseOrThrow(userSchema, item))
  },
  updateUser: async (input: UpdateUserInput): Promise<void> => {
    const { userId } = parseOrThrow(updateUserSchema, input)
    const attributes = definedEntries(input, ["userId"])

    const sets = attributes.map(([field]) => `#${field} = :${field}`)

    await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: userKey(userId),
        UpdateExpression: `SET #updatedAt = :updatedAt${sets.map((set) => `, ${set}`).join("")}`,
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: {
          "#updatedAt": "updatedAt",
          ...Object.fromEntries(attributes.map(([field]) => [`#${field}`, field])),
        },
        ExpressionAttributeValues: {
          ":updatedAt": Date.now(),
          ...Object.fromEntries(attributes.map(([field, value]) => [`:${field}`, value])),
        },
      }),
    )
  },
  createUser: async (input: CreateUserInput): Promise<void> => {
    const data = parseOrThrow(createUserSchema, input)
    const now = Date.now()

    const item = parseOrThrow(userItem, {
      ...userKey(data.userId),
      ...data,
      createdAt: now,
      lastActiveAt: now,
      updatedAt: now,
    })

    await AWSManager.dbClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    )
  },
  /** One auth-session row per login, newest last. */
  getAuthSessions: async (input: { userId: UserId }): Promise<AuthSession[]> => {
    const resp = await AWSManager.dbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
        ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK" },
        ExpressionAttributeValues: {
          ":pk": buildKey(PREFIXES.USER, input.userId),
          ":sk": AUTH_SESSION_PREFIX,
        },
      }),
    )

    return (resp.Items ?? []).map((item) => parseOrThrow(authSessionSchema, item))
  },
  getAuthSessionBySessionId: async (input: {
    userId: UserId
    sessionId: string
  }): Promise<AuthSession | undefined> => {
    const resp = await AWSManager.dbClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: authSessionKey(input.userId, input.sessionId),
      }),
    )

    return resp.Item ? parseOrThrow(authSessionSchema, resp.Item) : undefined
  },
  updateAuthSessionPushToken: async (input: {
    userId: UserId
    sessionId: string
    expoPushToken: string
  }): Promise<void> => {
    await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: authSessionKey(input.userId, input.sessionId),
        UpdateExpression: "SET expoPushToken = :expoPushToken",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: {
          ":expoPushToken": input.expoPushToken,
        },
      }),
    )
  },
  updateAuthSessionLastUsedAt: async (input: {
    userId: UserId
    sessionId: string
  }): Promise<void> => {
    await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: authSessionKey(input.userId, input.sessionId),
        UpdateExpression: "SET lastUsedAt = :lastUsedAt",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: {
          ":lastUsedAt": Date.now(),
        },
      }),
    )
  },
  createAuthSession: async (input: {
    userId: UserId
    sessionId: string
    client: AuthSession["client"]
    deviceName?: string
    platform?: AuthSession["platform"]
  }): Promise<string> => {
    const now = Date.now()

    const item = parseOrThrow(authSessionItem, {
      ...authSessionKey(input.userId, input.sessionId),
      sessionId: input.sessionId,
      client: input.client,
      ...(input.deviceName ? { deviceName: input.deviceName } : {}),
      ...(input.platform ? { platform: input.platform } : {}),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    })

    await AWSManager.dbClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }),
    )

    return input.sessionId
  },
  deleteAuthSession: async (input: { userId: UserId; sessionId: string }): Promise<void> => {
    await AWSManager.dbClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: authSessionKey(input.userId, input.sessionId),
      }),
    )
  },
  deleteAllAuthSessions: async (input: { userId: UserId }): Promise<void> => {
    const sessions = await usersDao.getAuthSessions({ userId: input.userId })
    await Promise.all(
      sessions.map((session) =>
        usersDao.deleteAuthSession({
          userId: input.userId,
          sessionId: session.sessionId,
        }),
      ),
    )
  },
  /**
   *
   * @param profile
   * @returns profile with user active status "ONLINE" or "OFFLINE"
   */
  withPresence: async (profile: ConversationUserProfile) => {
    const activeConversation = await conversationsDao.getUserActiveConversation({
      userId: profile.userId,
    })

    const status: PeerUserStatus = activeConversation ? "ONLINE" : "OFFLINE"

    return { ...profile, status }
  },
}
