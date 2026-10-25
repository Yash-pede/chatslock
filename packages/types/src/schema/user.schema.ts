import z from "zod"
import { ROLE_NAMES } from "./roles"
import { PREFIXES } from "./keys"

const str = (min = 1, max = 255) => z.string().min(min).max(max)
const zodTimestamp = z.number().int().nonnegative()

export const userIdRegex = /^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i

export const userId = z.string().regex(userIdRegex, "Invalid userId")
/** Cognito sub — a lowercase uuid, no storage prefix. */
export type UserId = z.infer<typeof userId>
export const role = z.enum(ROLE_NAMES)
export const fullName = str(3, 50)
export const username = str(3, 20)
/** Public profile image URL. Stored as `avatar` everywhere. */
export const avatar = z.url("Invalid avatar URL format")
export const phone = z.string().regex(/^\+\d{10,15}$/, "Invalid phone number")

export const USER_SK = ["PROFILE"] as const

/** Valid SK values for user items; extend this union as new user sub-items are added. */
export type UserSK = (typeof USER_SK)[number]

/** Key attributes of a user item in the single-table design. */
export const userKeys = z.strictObject({
  PK: z.string().regex(new RegExp(`^${PREFIXES.USER}[^#]+$`), "Invalid user PK"),
  SK: z.enum(USER_SK),
})

/**
 * A user item as stored in DynamoDB.
 * Timestamps are epoch milliseconds and are populated by the DAO, never by callers.
 */
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
