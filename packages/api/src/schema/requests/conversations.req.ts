import z from "zod";
import {baseSchema} from "./base"

/** Base64url-encoded JSON of DynamoDB `LastEvaluatedKey`; opaque to clients. */
const maxStartKeyLength = 2048;

const pageSize = z.coerce.number().int("Page size must be a whole number").min(1, "Page size must be at least 1").max(25, "Page size cannot exceed 25").optional().default(10);

const startKey = z.string()
    .min(1, "startKey cannot be empty")
    .max(maxStartKeyLength, `startKey cannot exceed ${maxStartKeyLength} characters`)
    .regex(/^[A-Za-z0-9_-]+$/, "startKey must be base64url encoded")
    .optional();

export const getChatPageConversationSchema = baseSchema.extend({
    query: z.strictObject({
        pageSize,
        startKey,
    })
});

export type GetChatPageConversationInput = z.infer<typeof getChatPageConversationSchema>;