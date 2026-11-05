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

/** Sort-key prefix for auth-session rows (`AUTHSESSION#<refreshTokenHash>`). */
export const AUTH_SESSION_PREFIX = "AUTHSESSION#"

