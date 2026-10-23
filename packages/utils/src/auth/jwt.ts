/**
 * The slice of a Cognito ID token we actually use.
 *
 * Cognito puts the useful identity bits here: `sub` is the stable user id,
 * `cognito:username` is the sign-in handle, and phone/email appear when the
 * pool is configured with them as aliases.
 */
export interface IdTokenClaims {
  sub: string
  "cognito:username"?: string
  "cognito:groups"?: string[]
  email?: string
  phone_number?: string
  [claim: string]: unknown
}

export interface AuthUser {
  /** Stable id (`sub`). */
  id: string
  /** Sign-in handle (`cognito:username`). */
  username: string | null
  email: string | null
  phone: string | null
  groups: string[]
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function base64UrlToBytes(input: string): Uint8Array {
  let str = input.replace(/-/g, "+").replace(/_/g, "/")
  while (str.length % 4 !== 0) str += "="

  const bytes: number[] = []
  for (let i = 0; i < str.length; i += 4) {
    const c1 = B64.indexOf(str.charAt(i))
    const c2 = B64.indexOf(str.charAt(i + 1))
    const ch3 = str.charAt(i + 2)
    const ch4 = str.charAt(i + 3)
    const c3 = ch3 === "=" ? -1 : B64.indexOf(ch3)
    const c4 = ch4 === "=" ? -1 : B64.indexOf(ch4)

    bytes.push((c1 << 2) | (c2 >> 4))
    if (c3 !== -1) bytes.push(((c2 & 15) << 4) | (c3 >> 2))
    if (c4 !== -1) bytes.push(((c3 & 3) << 6) | c4)
  }
  return Uint8Array.from(bytes)
}

function utf8Decode(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i] ?? 0
    if (b < 0x80) {
      out += String.fromCharCode(b)
      i += 1
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | ((bytes[i + 1] ?? 0) & 0x3f))
      i += 2
    } else if (b < 0xf0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | (((bytes[i + 1] ?? 0) & 0x3f) << 6) | ((bytes[i + 2] ?? 0) & 0x3f),
      )
      i += 3
    } else {
      const cp =
        ((b & 0x07) << 18) |
        (((bytes[i + 1] ?? 0) & 0x3f) << 12) |
        (((bytes[i + 2] ?? 0) & 0x3f) << 6) |
        ((bytes[i + 3] ?? 0) & 0x3f)
      out += String.fromCodePoint(cp)
      i += 4
    }
  }
  return out
}

/** Decode a JWT payload without verifying the signature. */
export function decodeJwt<T = IdTokenClaims>(token: string): T | null {
  try {
    const payload = token.split(".")[1]
    if (!payload) return null
    return JSON.parse(utf8Decode(base64UrlToBytes(payload))) as T
  } catch {
    return null
  }
}

export function claimsToUser(claims: IdTokenClaims | null): AuthUser | null {
  if (!claims?.sub) return null
  return {
    id: claims.sub,
    username: claims["cognito:username"] ?? null,
    email: claims.email ?? null,
    phone: claims.phone_number ?? null,
    groups: claims["cognito:groups"] ?? [],
  }
}
