import z from "zod";

const zodTimestamp = z.number().int().nonnegative();

export const conversationIdRegex = /^[0-9a-z-]{8,64}$/i;
export const conversationId = z.string().regex(conversationIdRegex, "Invalid conversationId");

export const CONVERSATION_TYPE = ["DIRECT", "GROUP", "SUPPORT"] as const;
export type ConversationType = typeof CONVERSATION_TYPE[number];

export const CONVERSATION_SK = ["METADATA"] as const;
export type ConversationSK = typeof CONVERSATION_SK[number];

/** A conversation metadata item as stored in DynamoDB; timestamps are epoch milliseconds. */
export const conversationItem = z.strictObject({
    PK: z.string().regex(/^CONVERSATION#[^#]+$/, "Invalid conversation PK"),
    SK: z.enum(CONVERSATION_SK),
    conversationId,
    type: z.enum(CONVERSATION_TYPE),
    createdAt: zodTimestamp,
    updatedAt: zodTimestamp,
});

/** The conversation shape returned by the DAO and exposed through the API. */
export const conversationSchema = conversationItem.omit({PK: true, SK: true});


/** Builds the single-table key for a conversation item; `sk` defaults to `METADATA`. */
export const toConversationKeys = ({
    conversationId,
    type,
    sk = CONVERSATION_SK[0],
}: {
    conversationId: string;
    type: ConversationType;
    sk?: ConversationSK;
}): { PK: string; SK: ConversationSK } => ({
    PK: `CONVERSATION#${type}#${conversationId}`,
    SK: sk,
});
