import z from "zod"
import { ROLE_NAMES } from "./roles"
import { AUTH_SESSION_PREFIX, PREFIXES } from "./keys"

const str = (min = 1, max = 255) => z.string().min(min).max(max)
const zodTimestamp = z.number().int().nonnegative()

export const userIdRegex = /^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i

export const userId = z.string().regex(userIdRegex, "Invalid userId")
export type UserId = z.infer<typeof userId>
export const role = z.enum(ROLE_NAMES)
export const fullName = str(3, 50)
export const username = str(3, 20)
export const avatar = z.url("Invalid avatar URL format")
export const phone = z.string().regex(/^\+\d{10,15}$/, "Invalid phone number")

export const USER_SK = ["PROFILE", "CONNECTION"] as const

export type UserSK = (typeof USER_SK)[number]

export const userKeys = z.strictObject({
  PK: z.string().regex(new RegExp(`^${PREFIXES.USER}[^#]+$`), "Invalid user PK"),
  SK: z.enum(USER_SK),
})

export const userItem = z.strictObject({
  PK: userKeys.shape.PK,
  SK: userKeys.shape.SK,
  userId,
  cognitoUsername: str(1, 255),
  username,
  fullName,
  avatar: avatar.optional(),
  phone: phone.optional(),
  role,
  agentId: userId.optional(),
  lastActiveAt: zodTimestamp,
  createdAt: zodTimestamp,
  updatedAt: zodTimestamp,
})

/**
 * The user shape returned by the DAO and exposed through the API.
 * Non-strict, so a full DynamoDB item can be parsed directly: `PK`/`SK` and any
 * other storage-only attributes are dropped from the result.
 */
export const userSchema = z.object(userItem.omit({ PK: true, SK: true }).shape)

export const createUserSchema = userSchema.omit({
  lastActiveAt: true,
  createdAt: true,
  updatedAt: true,
})

/** The user shape returned to the client: `cognitoUsername`, timestamps and keys are dropped. */
export const getUserSchema = z.object(
  userItem.omit({
    PK: true,
    SK: true,
    cognitoUsername: true,
    createdAt: true,
    updatedAt: true,
  }).shape,
)

/** A user update: the partition key plus any fields to change. */
export const updateUserSchema = userSchema
  .omit({
    userId: true,
    createdAt: true,
    updatedAt: true,
    username: true,
  })
  .partial()
  .extend({ userId })

export const USERNAME_GSI = "SK_username_GSI"

/** A user row as returned by the DAO and exposed through the API. */
export type User = z.infer<typeof userSchema>
export type getUser = z.infer<typeof getUserSchema>
export type UserItem = z.infer<typeof userItem>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>

export const usersk = Object.fromEntries(USER_SK.map((key) => [key, key])) as {
  [K in UserSK]: K
}

/**
 * One auth login session: `PK USER#<userId>`, `SK AUTHSESSION#<hash>`.
 * The refresh token is stored so an evicted session can be revoked in Cognito.
 * The Expo push token is stored on the same row; one row per session.
 * This table is access-controlled and rows expire via TTL.
 */
export const authSessionItem = z.strictObject({
  PK: userKeys.shape.PK,
  SK: z.string().regex(new RegExp(`^${AUTH_SESSION_PREFIX}[^#]+$`), "Invalid auth session SK"),
  refreshToken: str(1, 4096),
  refreshTokenHash: str(1, 128),
  client: z.enum(["otp", "userpass"]),
  expoPushToken: str(1, 255).optional(),
  deviceName: str(1, 120).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
  createdAt: zodTimestamp,
  lastUsedAt: zodTimestamp,
  expiresAt: z.number().int().positive(),
})

export const authSessionSchema = z.object(authSessionItem.omit({ PK: true, SK: true }).shape)

export type AuthSessionItem = z.infer<typeof authSessionItem>
export type AuthSession = z.infer<typeof authSessionSchema>
