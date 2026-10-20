/**
 * Single-table prefixes: partition keys (`USER#`, `CONVERSATION#`), sort keys
 * (`CONVERSATION#<type>#<id>`) and GSI values (`MEMBER#`). Every key is built
 * from these, so the shape of the table lives in one place.
 */
export const PREFIXES = {
    USER: "USER#",
    CONVERSATION: "CONVERSATION#",
    MEMBER: "MEMBER#",
} as const;

export type PrefixName = keyof typeof PREFIXES;
