import z from "zod"

export const PREFIXES = {
  USER: "USER#",
  CONVERSATION: "CONVERSATION#",
  MEMBER: "MEMBER#",
  MESSAGE: "MESSAGE#",
} as const

export type PrefixName = keyof typeof PREFIXES

export const MAX_USER_SESSIONS = 4

/**
 * Auth-session lifetime, in seconds. Keep in sync with the Cognito app
 * client's refresh-token validity.
 */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

/** Sort-key prefix for auth-session rows (`AUTHSESSION#<sessionId>`). */
export const AUTH_SESSION_PREFIX = "AUTHSESSION#"

/**
 * Per-conversation message sequence. It travels as a digits-only string
 * everywhere on the wire; the stored item keeps it as a number so the sequence
 * GSI can range-query it (the DAO owns the conversion in both directions).
 */
export const messageIdSchema = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d{1,20}$/, "Invalid message id")])
  .transform((value) => String(value))
export type MessageId = z.infer<typeof messageIdSchema>
