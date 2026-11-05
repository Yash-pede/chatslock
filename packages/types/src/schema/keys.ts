export const PREFIXES = {
  USER: "USER#",
  CONVERSATION: "CONVERSATION#",
  MEMBER: "MEMBER#",
  MESSAGE: "MESSAGE#",
} as const

export type PrefixName = keyof typeof PREFIXES

export const MAX_USER_SESSIONS = 4
