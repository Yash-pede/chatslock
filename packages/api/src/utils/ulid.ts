import crypto from "node:crypto"

/**
 * ULID generation (Crockford base32): 10 chars of millisecond timestamp + 16
 * chars of randomness. ULIDs sort lexicographically by creation time, which is
 * what makes `MESSAGE#<ulid>` sort keys keep a conversation in chronological
 * order in DynamoDB.
 */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const TIME_LEN = 10
const RANDOM_LEN = 16

const encodeTime = (now: number): string => {
  if (now < 0 || !Number.isInteger(now))
    throw new Error("ULID timestamp must be a non-negative integer")
  if (now > 2 ** 48 - 1) throw new Error("ULID timestamp exceeds 48 bits")
  let out = ""
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ENCODING[now % 32] + out
    now = Math.floor(now / 32)
  }
  return out
}

const encodeRandom = (): string => {
  const bytes = crypto.randomBytes(RANDOM_LEN)
  let out = ""
  for (let i = 0; i < RANDOM_LEN; i++) out += ENCODING[bytes[i]! & 31]
  return out
}

export const generateUlid = (now: number = Date.now()): string => encodeTime(now) + encodeRandom()
