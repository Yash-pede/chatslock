import z from "zod"
import { baseSchema } from "./base"
import { compositeConversationId, ulid, userId } from "../schema"

/** Base64url-encoded JSON of DynamoDB `LastEvaluatedKey`; opaque to clients. */
export const maxStartKeyLength = 2048

export const getChatPageConversationSchema = baseSchema.extend({
  query: z.strictObject({
    pageSize: z.coerce
      .number()
      .int("Page size must be a whole number")
      .min(1, "Page size must be at least 1")
      .max(50, "Page size cannot exceed 25")
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

/**
 * `GET /api/conversations/messages?conversationId=...`. The composite id stays
 * in the query string because `#` cannot appear (encoded or not) in a path:
 * proxies may decode `%23` and the URL parser then treats the rest as a
 * fragment. Pages strictly older than `cursor`; the response carries the oldest
 * id on the page as `nextCursor`.
 */
export const getConversationMessagesSchema = baseSchema.extend({
  query: z.strictObject({
    conversationId: compositeConversationId,
    cursor: ulid.optional(),
    limit: z.coerce
      .number()
      .int("Limit must be a whole number")
      .min(1, "Limit must be at least 1")
      .max(50, "Limit cannot exceed 50")
      .optional()
      .default(25),
  }),
})

export type GetConversationMessagesRequest = z.infer<typeof getConversationMessagesSchema>

/** `GET /api/conversations/direct?userId=` — the direct chat with one peer. */
export const getDirectConversationSchema = baseSchema.extend({
  query: z.strictObject({
    userId,
  }),
})
export type GetDirectConversationRequest = z.infer<typeof getDirectConversationSchema>

/** `POST /api/conversations/direct` — create (or return) a direct chat. */
export const createDirectConversationSchema = baseSchema.extend({
  body: z.strictObject({
    userId,
  }),
})
export type CreateDirectConversationRequest = z.infer<typeof createDirectConversationSchema>

/** Max peers resolvable in one request (the chat page's page size). */
export const MAX_PROFILE_LOOKUP = 25
