import z from "zod"

/**
 * Crockford base32 ULID: 10 chars of timestamp + 16 chars of randomness.
 * Lives in its own module because both message and conversation items use it
 * (and both are exported from the same barrel; a shared module avoids a cycle).
 */
export const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid ULID")
