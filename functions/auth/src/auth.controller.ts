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
  sendOtp,
  verifyOtp,
} from "./auth.service"
import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderServiceException,
} from "@aws-sdk/client-cognito-identity-provider"
import { awsManagerInstance } from "@repo/api/utils"
import { HTTPException } from "hono/http-exception"
import { cognitoErrorName } from "./auth.service"

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

  return c.json({
    refreshToken: resp.AuthenticationResult?.RefreshToken,
    accessToken: resp.AuthenticationResult?.AccessToken,
    idToken: resp.AuthenticationResult?.IdToken,
    expiresIn: resp.AuthenticationResult?.ExpiresIn,
    client: "otp" as const,
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

    const userPoolId = await awsManagerInstance.getSecretValue("cognito_user_pool_id")
    const clientId = await awsManagerInstance.getSecretValue("cognito_admin_client_id")

    const command = new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: body.username,
        PASSWORD: body.password,
      },
    })
    const response = await awsManagerInstance.cognitoClient.send(command)
    const { AccessToken, RefreshToken } = response.AuthenticationResult || {}

    if (!AccessToken || !RefreshToken) {
      throw new HTTPException(401, { message: INVALID_PASSWORD_MESSAGE })
    }

    return c.json({
      refreshToken: response.AuthenticationResult?.RefreshToken,
      accessToken: response.AuthenticationResult?.AccessToken,
      idToken: response.AuthenticationResult?.IdToken,
      expiresIn: response.AuthenticationResult?.ExpiresIn,
      client: "userpass" as const,
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

  const resp = await cognitoRefreshCall(body.refreshToken, body.client)
  return c.json({
    accessToken: resp.AuthenticationResult?.AccessToken,
    idToken: resp.AuthenticationResult?.IdToken,
    expiresIn: resp.AuthenticationResult?.ExpiresIn,
  })
}

export const logOutUserController = async (c: Context) => {
  const accessToken = c.req.header("Authorization")?.split(" ")[1]
  if (accessToken) {
    await cognitoLogout(accessToken)
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
