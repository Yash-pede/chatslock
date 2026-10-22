import z from "zod";
import {PREFIXES} from "./keys";

const zodTimestamp = z.number().int().nonnegative();

export const conversationId = z.string().min(1);

export const CONVERSATION_TYPE = ["DIRECT", "GROUP", "SUPPORT"] as const;
export type ConversationType = typeof CONVERSATION_TYPE[number];

export const CONVERSATION_SK = ["METADATA"] as const;
export type ConversationSK = typeof CONVERSATION_SK[number];

/** `CONVERSATION#<type>#<suffix>`; the suffix is `conversationId` (DIRECT: two ids). */
export const conversationKey = z.string().min(1);

/**
 * The API-facing conversation id: `TYPE#id` (e.g. `DIRECT#u1#u2`). One value
 * carries the type and the storage id, so callers never pass the type separately.
 */
export const compositeConversationId = z.string().regex(
    new RegExp(`^(${CONVERSATION_TYPE.join("|")})#(.+)$`),
    "Invalid conversation id",
);

/** A conversation metadata item as stored in DynamoDB; timestamps are epoch milliseconds. */
export const conversationItem = z.strictObject({
    PK: conversationKey,
    SK: z.enum(CONVERSATION_SK),
    /** Composite `TYPE#id` (e.g. `DIRECT#u1#u2`); the same value clients use everywhere. */
    conversationId: compositeConversationId,
    conversationType: z.enum(CONVERSATION_TYPE),
    createdAt: zodTimestamp,
    updatedAt: zodTimestamp,
});

/**
 * The conversation shape returned by the DAO and exposed through the API.
 * Non-strict, so a full DynamoDB item can be parsed directly: `PK`/`SK` are dropped.
 */
export const conversationSchema = z.object(conversationItem.omit({PK: true, SK: true}).shape);

/** A user's membership row for a conversation, stored under `USER#<userId>`. */
export const userMember_conversationItem = z.strictObject({
    PK: z.string(),
    SK: conversationKey,
    userMember: z.string(),
    unreadCount: z.int().default(0),
    lastMessageId: z.uuid().optional(),
    lastMessagePreview: z.string().optional(),
    lastMessageAt: z.int().optional(),
});

/**
 * The membership shape returned by the DAO and exposed through the API.
 * `conversationId` is the composite `TYPE#id` and `conversationType` is kept for
 * readability; both are projected out of the sort key at the DAO boundary, so
 * storage keys never reach callers.
 */
export const userMember_conversationSchema = z.object({
    ...userMember_conversationItem.omit({
        PK: true,
        SK: true,
        userMember: true,
    }).shape,
    conversationId: compositeConversationId,
    conversationType: z.enum(CONVERSATION_TYPE),
});

export const CONVERSATIONS_MEMBERLIST_GSI = "ConversationsMemberList_GSI";

/** A conversation metadata row as returned by the DAO and exposed through the API. */
export type Conversation = z.infer<typeof conversationSchema>;
/** A conversation metadata row exactly as stored in DynamoDB. */
export type ConversationItem = z.infer<typeof conversationItem>;

/** A membership row as returned by the DAO and exposed through the API. */
export type UserMemberConversation = z.infer<typeof userMember_conversationSchema>;
export type UserMemberConversationItem = z.infer<typeof userMember_conversationItem>;
