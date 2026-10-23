import z from "zod"
import { baseSchema } from "./base"
import { compositeConversationId, userId } from "../schema"

/** Base64url-encoded JSON of DynamoDB `LastEvaluatedKey`; opaque to clients. */
export const maxStartKeyLength = 2048

export const getChatPageConversationSchema = baseSchema.extend({
  query: z.strictObject({
    pageSize: z.coerce
      .number()
      .int("Page size must be a whole number")
      .min(1, "Page size must be at least 1")
      .max(25, "Page size cannot exceed 25")
      .optional()
      .default(10),
    startKey: z
      .string()
      .min(1, "startKey cannot be empty")
      .max(maxStartKeyLength, `startKey cannot exceed ${maxStartKeyLength} characters`)
      .regex(/^[A-Za-z0-9_-]+$/, "startKey must be base64url encoded")
      .optional(),
  }),
})

export type GetChatPageConversationRequest = z.infer<typeof getChatPageConversationSchema>
export type GetChatPageConversationInput = z.input<typeof getChatPageConversationSchema>

/** Max peers resolvable in one request (the chat page's page size). */
export const MAX_PROFILE_LOOKUP = 25

export const getConversationProfilesSchema = baseSchema.extend({
  body: z.strictObject({
    userIds: z
      .array(userId)
      .min(1, "At least one userId is required")
      .max(MAX_PROFILE_LOOKUP, `At most ${MAX_PROFILE_LOOKUP} userIds are allowed`)
      .refine((ids) => new Set(ids).size === ids.length, "userIds must be unique"),
  }),
})

export type GetConversationProfilesRequest = z.infer<typeof getConversationProfilesSchema>
export type GetConversationProfilesInput = z.input<typeof getConversationProfilesSchema>

/** Max messages returned by `POST /api/conversations/messages`. */
export const MAX_MESSAGES_LOOKUP = 50

export const getConversationMessagesSchema = baseSchema.extend({
  body: z.strictObject({
    /** Composite `TYPE#id`, exactly what `GET /api/conversations/chat` returns. */
    conversationId: compositeConversationId,
  }),
})

export type GetConversationMessagesRequest = z.infer<typeof getConversationMessagesSchema>
export type GetConversationMessagesInput = z.input<typeof getConversationMessagesSchema>
