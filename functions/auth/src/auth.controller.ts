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
  subFromToken,
  verifyOtp,
} from "./auth.service"
import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderServiceException,
} from "@aws-sdk/client-cognito-identity-provider"
import { AWSManager } from "@repo/api/utils"
import { HTTPException } from "hono/http-exception"
import { cognitoErrorName } from "./auth.service"
import { revokeAuthSession, usersDao } from "@repo/api/dao"

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
    refreshToken: resp.AuthenticationResult?.RefreshToken,
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
      refreshToken: RefreshToken,
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

export const refreshController = async (c: Context) => {
  const { body }: RefreshOtpRequest = c.get("valid")

  let resp: Awaited<ReturnType<typeof cognitoRefreshCall>>
  try {
    resp = await cognitoRefreshCall(body.refreshToken, body.client)
  } catch (error) {
    const code = cognitoErrorName(error)
    if (code === "NotAuthorizedException" || code === "InvalidParameterException") {
      // Revoked/expired refresh token: make the client discard its session.
      throw new HTTPException(401, { message: "Session expired. Sign in again." })
    }
    throw error
  }

  const userId = subFromToken(
    resp.AuthenticationResult?.IdToken ?? resp.AuthenticationResult?.AccessToken,
  )

  if (!userId) {
    throw new HTTPException(401, { message: "Session expired. Sign in again." })
  }

  const session = await usersDao.getAuthSession({
    userId,
    refreshToken: body.refreshToken,
  })

  // A missing row means the session was evicted by the 4-session limit (or
  // predates it); do not let it refresh back into a valid session.
  if (!session || session.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new HTTPException(401, { message: "Session expired. Sign in again." })
  }

  await usersDao.rotateAuthSession({
    userId,
    oldRefreshToken: body.refreshToken,
    newRefreshToken: resp.AuthenticationResult?.RefreshToken ?? body.refreshToken,
    client: body.client,
    deviceName: session.deviceName,
    platform: session.platform,
    createdAt: session.createdAt,
  })

  return c.json({
    accessToken: resp.AuthenticationResult?.AccessToken,
    idToken: resp.AuthenticationResult?.IdToken,
    expiresIn: resp.AuthenticationResult?.ExpiresIn,
    sessionId: session.refreshTokenHash,
  })
}

export const logOutUserController = async (c: Context) => {
  const claims = c.env.requestContext?.authorizer?.jwt?.claims

  const userId = claims?.sub
  if (typeof userId !== "string") throw new HTTPException(401, { message: "Unauthorized" })

  const body = await c.req.json().catch(() => null)
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined

  // The session id is the refresh-token hash. Current clients send it so only
  // this device is logged out.
  if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
    await revokeAuthSession({ userId, refreshTokenHash: sessionId })
    return c.json({ message: "Logged out" })
  }

  // Legacy clients did not send a hash; keep the old global sign-out.
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
