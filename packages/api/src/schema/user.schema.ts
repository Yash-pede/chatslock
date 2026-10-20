import z from "zod";
import {ROLE_NAMES} from "./roles";

const str = (min = 1, max = 255) => z.string().min(min).max(max);
const zodTimestamp = z.number().int().nonnegative();

export const userIdRegex = /^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i;

export const userId = z.string().regex(userIdRegex, "Invalid userId");
export const role = z.enum(ROLE_NAMES);
export const fullName = str(3, 50);
export const username = str(3, 20);
export const imageUrl = z.url("Invalid image URL format");
export const phone = z.string().regex(/^\+\d{10,15}$/, "Invalid phone number");

export const USER_SK = ["PROFILE"] as const;

/** Valid SK values for user items; extend this union as new user sub-items are added. */
export type UserSK = typeof USER_SK[number];

/** Key attributes of a user item in the single-table design. */
export const userKeys = z.strictObject({
    PK: z.string().regex(/^USER#[^#]+$/, "Invalid user PK"),
    SK: z.enum(USER_SK),
});


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
    imageUrl: imageUrl.optional(),
    phone: phone.optional(),
    role,
    agentId: userId.optional(),
    createdAt: zodTimestamp,
    updatedAt: zodTimestamp,
});

/** The user shape returned by the DAO and exposed through the API. */
export const userSchema = userItem.omit({PK: true, SK: true});

/** Fields required to create a user; keys and timestamps are added by the DAO. */
export const createUserSchema = userSchema.omit({createdAt: true, updatedAt: true});

/** A user update: the partition key plus any fields to change. */
export const updateUserSchema = userSchema
    .omit({userId: true, createdAt: true, updatedAt: true, username: true, phone: true})
    .partial()
    .extend({userId});


// GSI's
export const USERNAME_GSI = "SK_username_GSI"


/** Builds the single-table key for a user item; `sk` defaults to `PROFILE`. */
export const toUserKeys = ({
    userId,
    sk = USER_SK[0],
}: {
    userId: string;
    sk?: UserSK | string;
}): { PK: string; SK: string } => ({
    PK: `USER#${userId}`,
    SK: sk,
});
