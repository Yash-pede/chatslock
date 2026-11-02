import { BatchGetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
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
  type CreateUserInput,
  type DeviceId,
  type UpdateUserInput,
  type ConversationUserProfile,
  type UserId,
  usersk,
  UserSK,
  userDeviceSchema,
  type UserDevice,
} from "@repo/types/schema"
import { MAX_PROFILE_LOOKUP } from "@repo/types/req"
import z from "zod"
import { AWSManager, buildKey, definedEntries, parseOrThrow } from "../utils"

const userKey = (userId: UserId, sk?: UserSK) => ({
  PK: buildKey(PREFIXES.USER, userId),
  SK: sk ? sk : usersk.PROFILE,
})

/** Device push registrations expire unless the app refreshes them. */
const PUSH_TOKEN_TTL_SECONDS = 15 * 24 * 60 * 60

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
  setUserDevicePushToken: async (input: {
    userId: UserId
    deviceId: DeviceId
    expoPushToken: string
  }): Promise<void> => {
    const now = Date.now()

    await AWSManager.dbClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: buildKey(PREFIXES.USER, input.userId),
          SK: buildKey(usersk.DEVICE, input.deviceId),
        },
        UpdateExpression:
          "SET deviceId = :deviceId, expoPushToken = :expoPushToken, #updatedAt = :updatedAt, expiresAt = :expiresAt",
        ExpressionAttributeNames: {
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":deviceId": input.deviceId,
          ":expoPushToken": input.expoPushToken,
          ":updatedAt": now,
          ":expiresAt": Math.floor(now / 1000) + PUSH_TOKEN_TTL_SECONDS,
        },
      }),
    )
  },
  getUserAllPushToken: async (input: { userId: UserId }): Promise<UserDevice[]> => {
    const resp = await AWSManager.dbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
        ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK" },
        ExpressionAttributeValues: {
          ":pk": buildKey(PREFIXES.USER, input.userId),
          ":sk": usersk.DEVICE,
        },
      }),
    )
    return (resp.Items ?? []).map((item) => parseOrThrow(userDeviceSchema, item))
  },
}
