export const PREFIXES = {
  USER: "USER#",
  CONVERSATION: "CONVERSATION#",
  MEMBER: "MEMBER#",
  CONNECTION: "CONNECTION#",
  MESSAGE: "MESSAGE#",
} as const;

export type PrefixName = keyof typeof PREFIXES;
