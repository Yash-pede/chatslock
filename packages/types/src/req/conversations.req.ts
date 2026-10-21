import z from "zod";
import {baseSchema} from "./base";
import {conversationId, userId} from "../schema";

/** Base64url-encoded JSON of DynamoDB `LastEvaluatedKey`; opaque to clients. */
export const maxStartKeyLength = 2048;

export const getChatPageConversationSchema = baseSchema.extend({
    query: z.strictObject({
        pageSize: z.coerce.number().int("Page size must be a whole number").min(1, "Page size must be at least 1").max(25, "Page size cannot exceed 25").optional().default(10),
        startKey: z.string()
            .min(1, "startKey cannot be empty")
            .max(maxStartKeyLength, `startKey cannot exceed ${maxStartKeyLength} characters`)
            .regex(/^[A-Za-z0-9_-]+$/, "startKey must be base64url encoded")
            .optional(),
    }),
});

export const conversationIdParamsSchema = baseSchema.extend({
    params: z.strictObject({
        conversationId,
    }),
});

export type GetChatPageConversationRequest = z.infer<typeof getChatPageConversationSchema>;
export type GetChatPageConversationInput = z.input<typeof getChatPageConversationSchema>;
export type ConversationIdParamsRequest = z.infer<typeof conversationIdParamsSchema>;

/** Max peers resolvable in one request (the chat page's page size). */
export const MAX_PROFILE_LOOKUP = 25;

export const getConversationProfilesSchema = baseSchema.extend({
    body: z.strictObject({
        userIds: z.array(userId)
            .min(1, "At least one userId is required")
            .max(MAX_PROFILE_LOOKUP, `At most ${MAX_PROFILE_LOOKUP} userIds are allowed`)
            .refine((ids) => new Set(ids).size === ids.length, "userIds must be unique"),
    }),
});

export type GetConversationProfilesRequest = z.infer<typeof getConversationProfilesSchema>;
export type GetConversationProfilesInput = z.input<typeof getConversationProfilesSchema>;
