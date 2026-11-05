import { createHash } from "node:crypto"
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
import { MAX_PROFILE_LOOKUP } from "@repo/types/req"
import z from "zod"
import { AWSManager, buildKey, definedEntries, parseOrThrow } from "../utils"

const userKey = (userId: UserId, sk?: UserSK) => ({
  PK: buildKey(PREFIXES.USER, userId),
  SK: sk ? sk : usersk.PROFILE,
})

/** Auth-session rows live as long as the Cognito refresh token. */
const hashRefreshToken = (refreshToken: string) =>
  createHash("sha256").update(refreshToken).digest("hex")

const authSessionKey = (userId: UserId, refreshTokenHash: string) => ({
  PK: buildKey(PREFIXES.USER, userId),
  SK: `${AUTH_SESSION_PREFIX}${refreshTokenHash}`,
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
            ProjectionExpression: "userId, username, fullName, avatar",
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
  createUserConnection: async ({
    userId,
    connectionId,
  }: {
    userId: UserId
    connectionId: string
  }) => {
    return (await AWSManager.cacheClient()).sadd(
      buildKey(PREFIXES.USER, userId, usersk.CONNECTION),
      connectionId,
    )
  },

  getUserConnections: async (input: { userId: UserId }) => {
    return await (
      await AWSManager.cacheClient()
    ).smembers(buildKey(PREFIXES.USER, input.userId, usersk.CONNECTION))
  },
  deleteUserConnection: async (input: { userId: UserId; connectionId: string }) => {
    return (await AWSManager.cacheClient()).srem(
      buildKey(PREFIXES.USER, input.userId, usersk.CONNECTION),
      input.connectionId,
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
  getAuthSessionByHash: async (input: {
    userId: UserId
    refreshTokenHash: string
  }): Promise<AuthSession | undefined> => {
    const resp = await AWSManager.dbClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: authSessionKey(input.userId, input.refreshTokenHash),
      }),
    )

    return resp.Item ? parseOrThrow(authSessionSchema, resp.Item) : undefined
  },
  getAuthSession: async (input: {
    userId: UserId
    refreshToken: string
  }): Promise<AuthSession | undefined> => {
    return await usersDao.getAuthSessionByHash({
      userId: input.userId,
      refreshTokenHash: hashRefreshToken(input.refreshToken),
    })
  },
  updateAuthSessionPushToken: async (input: {
    userId: UserId
    refreshTokenHash: string
    expoPushToken: string
  }): Promise<void> => {
    await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: authSessionKey(input.userId, input.refreshTokenHash),
        UpdateExpression: "SET expoPushToken = :expoPushToken",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: {
          ":expoPushToken": input.expoPushToken,
        },
      }),
    )
  },
  createAuthSession: async (input: {
    userId: UserId
    refreshToken: string
    client: AuthSession["client"]
    deviceName?: string
    platform?: AuthSession["platform"]
  }): Promise<string> => {
    const now = Date.now()
    const refreshTokenHash = hashRefreshToken(input.refreshToken)

    const item = parseOrThrow(authSessionItem, {
      ...authSessionKey(input.userId, refreshTokenHash),
      refreshToken: input.refreshToken,
      refreshTokenHash,
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

    return refreshTokenHash
  },
  rotateAuthSession: async (input: {
    userId: UserId
    oldRefreshToken: string
    newRefreshToken: string
    client: AuthSession["client"]
    deviceName?: string
    platform?: AuthSession["platform"]
    createdAt: number
  }): Promise<void> => {
    const now = Date.now()
    const oldHash = hashRefreshToken(input.oldRefreshToken)
    const newHash = hashRefreshToken(input.newRefreshToken)
    const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS

    if (oldHash === newHash) {
      await AWSManager.dbClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: authSessionKey(input.userId, oldHash),
          UpdateExpression: "SET lastUsedAt = :lastUsedAt, expiresAt = :expiresAt",
          ExpressionAttributeValues: {
            ":lastUsedAt": now,
            ":expiresAt": expiresAt,
          },
        }),
      )
      return
    }

    await usersDao.deleteAuthSession({ userId: input.userId, refreshTokenHash: oldHash })
    await AWSManager.dbClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: parseOrThrow(authSessionItem, {
          ...authSessionKey(input.userId, newHash),
          refreshToken: input.newRefreshToken,
          refreshTokenHash: newHash,
          client: input.client,
          ...(input.deviceName ? { deviceName: input.deviceName } : {}),
          ...(input.platform ? { platform: input.platform } : {}),
          createdAt: input.createdAt,
          lastUsedAt: now,
          expiresAt,
        }),
      }),
    )
  },
  deleteAuthSession: async (input: {
    userId: UserId
    refreshTokenHash: string
  }): Promise<void> => {
    await AWSManager.dbClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: authSessionKey(input.userId, input.refreshTokenHash),
      }),
    )
  },
  deleteAllAuthSessions: async (input: { userId: UserId }): Promise<void> => {
    const sessions = await usersDao.getAuthSessions({ userId: input.userId })
    await Promise.all(
      sessions.map((session) =>
        usersDao.deleteAuthSession({
          userId: input.userId,
          refreshTokenHash: session.refreshTokenHash,
        }),
      ),
    )
  },
}
