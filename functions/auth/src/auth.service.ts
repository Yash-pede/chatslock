import { HTTPException } from "hono/http-exception"
import { authDao, usersDao } from "@repo/api/dao"
import { MAX_USER_SESSIONS, type AuthClient, type RoleName } from "@repo/types/schema"

export async function sendOtp(phone: string) {
  const username = await getOrCreateUserByPhone(phone)
  try {
    const response = await authDao.initiateAuth({
      authFlow: "CUSTOM_AUTH",
      authParameters: { USERNAME: username },
    })

    return {
      ...response,
      username,
    }
  } catch (e) {
    console.error("[auth] failed to send OTP", { phone, username }, e)
    throw new HTTPException(500, { message: "unable to send otp." })
  }
}

/** Wrong, expired, used or missing code — all correctable by the user. */
const OTP_REJECTED_CODES = new Set([
  "CodeMismatchException",
  "ExpiredCodeException",
  "NotAuthorizedException",
  "UserNotFoundException",
])

/** Too many attempts or SMS requests for this account. */
const OTP_THROTTLED_CODES = new Set([
  "TooManyRequestsException",
  "LimitExceededException",
  "TooManyFailedAttemptsException",
])

/**
 * Cognito reports the failure reason in the exception `name`, which the SDK
 * turns into a `__type` of e.g. `CodeMismatchException`. Anything we do not
 * recognise stays a generic server error so internals are not leaked.
 */
export function cognitoErrorName(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined
  const { name, Code } = err as { name?: unknown; Code?: unknown }
  const value = typeof name === "string" ? name : typeof Code === "string" ? Code : undefined
  return value ? value.split("#").pop() : undefined
}

/** A wrong answer that Cognito accepted into a new challenge (not a dead session). */
export interface OtpRetryChallenge {
  answerCorrect: false
  session: string | undefined
}

/**
 * Returns the authentication result, or a retry challenge when the code was
 * wrong but the session is still alive.
 *
 * Cognito issues a fresh `Session` after every wrong answer: the supplied one
 * is spent and the next `RespondToAuthChallenge` must use the new one. Without
 * returning it the client can never recover from a typo without starting over.
 */
export const verifyOtp = async (
  otp: string,
  username: string,
  session: string,
): Promise<Awaited<ReturnType<typeof authDao.respondToAuthChallenge>> | OtpRetryChallenge> => {
  try {
    return await authDao.respondToAuthChallenge({
      session,
      challengeResponses: {
        USERNAME: username,
        ANSWER: otp,
      },
    })
  } catch (err) {
    const code = cognitoErrorName(err)
    console.warn("[auth] OTP verification rejected", { username, code })

    if (code && OTP_REJECTED_CODES.has(code)) {
      // The attempt limit ends the challenge; nothing left to retry with.
      const message =
        code === "ExpiredCodeException" || code === "NotAuthorizedException"
          ? "That code has expired. Request a new one."
          : "That code is incorrect or has already been used. Check it and try again."
      throw new HTTPException(401, { message })
    }

    if (code && OTP_THROTTLED_CODES.has(code)) {
      throw new HTTPException(429, {
        message: "Too many attempts. Wait a moment and request a new code.",
      })
    }

    console.error("[auth] OTP verification failed", { username }, err)
    throw new HTTPException(500, { message: "Unable to verify the code. Try again in a moment." })
  }
}

export const getOrCreateUserByPhone = async (phone: string) => {
  const existing = await authDao.getUserByPhone({ phone })
  if (existing) return existing

  const cognitoUsername = `user_${phone}`

  await authDao.createUser({
    cognitoUsername,
    attributes: [
      { Name: "phone_number", Value: phone },
      { Name: "phone_number_verified", Value: "true" },
    ],
  })

  return cognitoUsername
}

export async function getCognitoUserGroups(username: string) {
  return await authDao.listGroupsForUser({ cognitoUsername: username })
}

export async function cognitoRefreshCall(refreshToken: string, client: AuthClient = "otp") {
  return await authDao.initiateAuth({
    authFlow: "REFRESH_TOKEN_AUTH",
    authParameters: { REFRESH_TOKEN: refreshToken },
    client,
  })
}

export async function cognitoLogout(accessToken: string) {
  return await authDao.globalSignOut({ accessToken })
}

/** Cognito JWTs are base64url; the payload carries the stable `sub`. */
export function subFromToken(token: string | undefined): string | undefined {
  if (!token) return undefined

  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { sub?: unknown }
    return typeof payload.sub === "string" ? payload.sub : undefined
  } catch {
    return undefined
  }
}

/**
 * Records a login in the auth-session table. When the user already has
 * MAX_USER_SESSIONS active rows, the oldest session's Cognito refresh token is
 * revoked and its row removed before the new session is stored.
 */
export async function recordAuthSession({
  idToken,
  refreshToken,
  client,
  deviceName,
  platform,
}: {
  idToken: string | undefined
  refreshToken: string | undefined
  client: AuthClient
  deviceName?: string
  platform?: "ios" | "android" | "web"
}): Promise<string | undefined> {
  if (!refreshToken) return undefined

  const userId = subFromToken(idToken)
  if (!userId) {
    console.error("[auth] could not read sub from token; session not recorded")
    return undefined
  }

  const now = Math.floor(Date.now() / 1000)
  const activeSessions = (await usersDao.getAuthSessions({ userId })).filter(
    (session) => session.expiresAt > now,
  )

  if (activeSessions.length >= MAX_USER_SESSIONS) {
    const oldest = activeSessions.reduce((acc, cur) => (cur.createdAt < acc.createdAt ? cur : acc))

    try {
      await authDao.revokeToken({
        refreshToken: oldest.refreshToken,
        client: oldest.client,
      })
    } catch (error) {
      // Even if Cognito refuses (already expired/revoked), drop our session row
      // so it stops counting toward the limit.
      console.error("[auth] failed to revoke oldest refresh token", error)
    }

    await usersDao.deleteAuthSession({
      userId,
      refreshTokenHash: oldest.refreshTokenHash,
    })
  }

  return await usersDao.createAuthSession({
    userId,
    refreshToken,
    client,
    ...(deviceName ? { deviceName } : {}),
    ...(platform ? { platform } : {}),
  })
}

export async function adminCreateUser(
  username: string,
  password: string,
  role: string,
  fullName?: string,
) {
  const status = await authDao.getUserStatus({ cognitoUsername: username })

  // A leftover FORCE_CHANGE_PASSWORD user is a half-finished create (e.g. the
  // password failed the pool policy after AdminCreateUser succeeded), so
  // resume it instead of failing. Anything else is a real duplicate.
  if (status && status !== "FORCE_CHANGE_PASSWORD") {
    throw new HTTPException(409, { message: "User already exists" })
  }

  if (!status) {
    await authDao.createUser({
      cognitoUsername: username,
      attributes: [{ Name: "given_name", Value: fullName || "" }],
    })
  }

  await authDao.setUserPassword({ cognitoUsername: username, password })
  await authDao.addUserToGroup({ cognitoUsername: username, groupName: role as RoleName })

  const userId = await authDao.getCognitoUserIdWithUsername({ cognitoUsername: username })

  if (!userId) throw new HTTPException(500, { message: "Unable to create user" })
  await usersDao.createUser({
    userId,
    cognitoUsername: username,
    username,
    fullName: fullName || "",
    role: role as RoleName,
  })

  return await authDao.adminInitiateAuth({ username, password })
}
