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

/** A conversation metadata item as stored in DynamoDB; timestamps are epoch milliseconds. */
export const conversationItem = z.strictObject({
    PK: conversationKey,
    SK: z.enum(CONVERSATION_SK),
    conversationId,
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
 * `conversationId`/`conversationType` are projected out of the sort key at the DAO
 * boundary, so storage keys never reach callers.
 */
export const userMember_conversationSchema = z.object({
    ...userMember_conversationItem.omit({
        PK: true,
        SK: true,
        userMember: true,
    }).shape,
    conversationId,
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
