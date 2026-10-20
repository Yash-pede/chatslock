import z from "zod";
import {PREFIXES} from "./keys";

const zodTimestamp = z.number().int().nonnegative();

export const conversationIdRegex = /^[0-9a-z-]{8,64}$/i;
export const conversationId = z.string().regex(conversationIdRegex, "Invalid conversationId");

export const CONVERSATION_TYPE = ["DIRECT", "GROUP", "SUPPORT"] as const;
export type ConversationType = typeof CONVERSATION_TYPE[number];

export const CONVERSATION_SK = ["METADATA"] as const;
export type ConversationSK = typeof CONVERSATION_SK[number];

/** A conversation metadata item as stored in DynamoDB; timestamps are epoch milliseconds. */
export const conversationItem = z.strictObject({
    PK: z.string().regex(new RegExp(`^${PREFIXES.CONVERSATION}[^#]+$`), "Invalid conversation PK"),
    SK: z.enum(CONVERSATION_SK),
    conversationId,
    type: z.enum(CONVERSATION_TYPE),
    createdAt: zodTimestamp,
    updatedAt: zodTimestamp,
});

/**
 * The conversation shape returned by the DAO and exposed through the API.
 * Non-strict, so a full DynamoDB item can be parsed directly: `PK`/`SK` are dropped.
 */
export const conversationSchema = z.object(conversationItem.omit({PK: true, SK: true}).shape);

export const userMember_conversationItem = z.strictObject({
    PK: z.string().regex(new RegExp(`^${PREFIXES.USER}[^#]+$`)),
    SK: z.string().regex(new RegExp(`^${PREFIXES.CONVERSATION}[^#]+$`)),
    member_user: z.string().regex(new RegExp(`^${PREFIXES.MEMBER}[^#]+$`)),
    unreadCount: z.int().default(0),
    lastMessageId: z.uuid(),
    lastMessagePreview: z.string().optional(),
    lastMessageAt: z.int().optional(),
})

export const userMember_conversationSchema = z.object(userMember_conversationItem.omit({
    PK: true,
    SK: true,
    member_user: true
}).shape);

export const CONVERSATIONS_MEMBERLIST_GSI = "ConversationsMemberList_GSI"