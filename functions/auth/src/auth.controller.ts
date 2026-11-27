import { Context } from "hono"
import type {
  InitiateOtpRequest,
  LoginRequest,
  RefreshOtpRequest,
  VerifyOtpRequest,
} from "@repo/types/req"
import {
  adminCreateUser,
  cognitoLogout,
  cognitoRefreshCall,
  getCognitoUserGroups,
  recordAuthSession,
  sendOtp,
  verifyOtp,
} from "./auth.service"
import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderServiceException,
} from "@aws-sdk/client-cognito-identity-provider"
import { AWSManager } from "@repo/api/utils"
import { HTTPException } from "hono/http-exception"
import { cognitoErrorName } from "./auth.service"
import { usersDao } from "@repo/api/dao"

export const otpController = async (c: Context) => {
  const { body }: InitiateOtpRequest = c.get("valid")

  console.log("[auth] OTP requested", { phone: body.phone, role: body.role })
  const resp = await sendOtp(body.phone)
  return c.json({
    session: resp.Session,
    challengeName: resp.ChallengeName,
    username: resp.username,
  })
}

export const verifyOtpController = async (c: Context) => {
  const { body }: VerifyOtpRequest = c.get("valid")
  const resp = await verifyOtp(body.otp, body.username, body.session)

  if ("answerCorrect" in resp) {
    console.warn("[auth] OTP answer rejected, challenge still open", {
      username: body.username,
    })
    return c.json({
      answerCorrect: false,
      session: resp.session,
      message: "That code is incorrect. Check it and try again.",
    })
  }

  const sessionId = await recordAuthSession({
    idToken: resp.AuthenticationResult?.IdToken,
    client: "otp",
    deviceName: body.deviceName,
    platform: body.platform,
  })

  return c.json({
    refreshToken: resp.AuthenticationResult?.RefreshToken,
    accessToken: resp.AuthenticationResult?.AccessToken,
    idToken: resp.AuthenticationResult?.IdToken,
    expiresIn: resp.AuthenticationResult?.ExpiresIn,
    client: "otp" as const,
    sessionId,
  })
}

const INVALID_PASSWORD_MESSAGE =
  "Incorrect username or password. Password must be at least 8 characters and include uppercase, lowercase, a number and a special character."

/**
 * Staff sign-in. Input problems, unknown accounts and wrong passwords all
 * return the same message so the endpoint cannot be used to probe which
 * usernames exist or which rule a password failed.
 */
export const loginController = async (c: Context) => {
  const { body }: LoginRequest = c.get("valid")
  body.username = body.username.toLowerCase()

  try {
    let groups: Awaited<ReturnType<typeof getCognitoUserGroups>>

    try {
      groups = await getCognitoUserGroups(body.username)
    } catch (error) {
      if (error instanceof CognitoIdentityProviderServiceException) {
        throw new HTTPException(401, { message: "Incorrect username or password." })
      }
      throw error
    }

    const isAgent = groups.some((group) => group.GroupName === "agent")

    if (!isAgent) {
      throw new HTTPException(403, { message: "Use phone sign-in instead." })
    }

    const userPoolId = await AWSManager.getSecretValue("cognito_user_pool_id")
    const clientId = await AWSManager.getSecretValue("cognito_admin_client_id")

    const command = new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: body.username,
        PASSWORD: body.password,
      },
    })
    const response = await AWSManager.cognitoClient.send(command)
    const { AccessToken, RefreshToken } = response.AuthenticationResult || {}

    if (!AccessToken || !RefreshToken) {
      throw new HTTPException(401, { message: INVALID_PASSWORD_MESSAGE })
    }

    const sessionId = await recordAuthSession({
      idToken: response.AuthenticationResult?.IdToken,
      client: "userpass",
      deviceName: body.deviceName,
      platform: body.platform,
    })

    return c.json({
      refreshToken: response.AuthenticationResult?.RefreshToken,
      accessToken: response.AuthenticationResult?.AccessToken,
      idToken: response.AuthenticationResult?.IdToken,
      expiresIn: response.AuthenticationResult?.ExpiresIn,
      client: "userpass" as const,
      sessionId,
    })
  } catch (error) {
    if (error instanceof HTTPException) throw error

    const code = cognitoErrorName(error)

    // Throttling and unconfirmed accounts are actionable and distinct from a
    // wrong password, so they must not be hidden behind the generic message.
    if (code === "TooManyRequestsException" || code === "LimitExceededException") {
      throw new HTTPException(429, {
        message: "Too many sign-in attempts. Wait a moment and try again.",
      })
    }
    if (code === "UserNotConfirmedException") {
      throw new HTTPException(403, { message: "This account is not confirmed yet." })
    }
    if (code === "PasswordResetRequiredException") {
      throw new HTTPException(403, { message: "Ask an admin to reset your password." })
    }

    if (error instanceof CognitoIdentityProviderServiceException) {
      // Wrong password, or a password that the pool policy rejects.
      throw new HTTPException(401, { message: INVALID_PASSWORD_MESSAGE })
    }

    // Never let an unexpected failure reach the client as a Cognito trace.
    console.error("Agent sign-in failed", error)
    throw new HTTPException(500, { message: "Unable to sign in right now. Try again in a moment." })
  }
}

/**
 * A failed refresh means the stored session can never sign in again. Look the
 * row up first (`USER#<userId>` + `AUTHSESSION#<sessionId>`) and delete it when
 * it still exists, so its Expo push token stops receiving notifications. Best
 * effort: cleanup never masks the original error.
 */
const deleteDeadSession = async (params: { userId: string; sessionId: string }): Promise<void> => {
  const session = await usersDao
    .getAuthSessionBySessionId({ userId: params.userId, sessionId: params.sessionId })
    .catch(() => undefined)

  if (!session) return

  await usersDao
    .deleteAuthSession({ userId: params.userId, sessionId: params.sessionId })
    .catch((error) => {
      console.warn("[auth] failed to delete dead refresh session", { userId: params.userId, error })
    })
}

export const refreshController = async (c: Context) => {
  const { body }: RefreshOtpRequest = c.get("valid")
  const { userId, sessionId } = body

  try {
    const resp = await cognitoRefreshCall(body.refreshToken, body.client)
    const tokens = resp.AuthenticationResult

    if (!tokens?.RefreshToken) {
      throw new HTTPException(401, { message: "Session expired. Sign in again." })
    }

    const session = await usersDao.getAuthSessionBySessionId({ userId, sessionId })
    if (!session || session.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new HTTPException(401, { message: "Session expired. Sign in again." })
    }

    // Best effort: a failed metadata write must not kill a valid refresh.
    await usersDao
      .updateAuthSessionLastUsedAt({ userId, sessionId: session.sessionId })
      .catch((error) => {
        console.warn("[auth] failed to bump session lastUsedAt", { userId, error })
      })

    return c.json({
      accessToken: tokens.AccessToken,
      idToken: tokens.IdToken,
      expiresIn: tokens.ExpiresIn,
      sessionId: session.sessionId,
      refreshToken: tokens.RefreshToken,
    })
  } catch (error) {
    // Any failure here leaves the session unusable: delete the row (and its
    // push token) when it still exists, then surface the error.
    await deleteDeadSession({ userId, sessionId })

    const code = cognitoErrorName(error)
    if (code === "NotAuthorizedException" || code === "InvalidParameterException") {
      throw new HTTPException(401, { message: "Session expired. Sign in again." })
    }
    throw error
  }
}

export const logOutUserController = async (c: Context) => {
  const claims = c.env.requestContext?.authorizer?.jwt?.claims

  const userId = claims?.sub
  if (typeof userId !== "string") throw new HTTPException(401, { message: "Unauthorized" })

  const body = await c.req.json().catch(() => null)
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined
  if (!sessionId)
    return c.json({
      message: "no session id found",
    })
  const session = await usersDao.getAuthSessionBySessionId({ userId, sessionId })
  if (session) {
    await usersDao.deleteAuthSession({
      userId,
      sessionId,
    })
    return c.json({ message: "Logged out" })
  }

  const accessToken = c.req.header("Authorization")?.split(" ")[1]
  if (!accessToken) throw new HTTPException(400, { message: "Missing access token" })

  try {
    await cognitoLogout(accessToken)
  } catch (error) {
    console.error("[auth] cognito logout failed", { userId, error })
  }

  // GlobalSignOut revoked every refresh token for this user, so none of the
  // stored auth sessions can be refreshed again.
  try {
    await usersDao.deleteAllAuthSessions({ userId })
  } catch (error) {
    console.error("[auth] failed to delete auth sessions", { userId, error })
  }

  return c.json({
    message: "Logged out",
  })
}

export const adminCreateUserController = async (c: Context) => {
  const { fullName, username, password, role } = await c.req.json()
  const resp = await adminCreateUser(username, password, role, fullName)
  return c.json(resp)
}
