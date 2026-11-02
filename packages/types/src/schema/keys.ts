export const PREFIXES = {
  USER: "USER#",
  CONVERSATION: "CONVERSATION#",
  MEMBER: "MEMBER#",
  MESSAGE: "MESSAGE#",
} as const

export type PrefixName = keyof typeof PREFIXES
