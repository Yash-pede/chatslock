import type { AuthClient } from "@repo/types/schema"
import { AWSManager, awsManagerInstance, RoleName } from "../utils"
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminListGroupsForUserCommand,
  AdminSetUserPasswordCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  ListUsersCommand,
  RespondToAuthChallengeCommand,
  UserNotFoundException,
  type AttributeType,
} from "@aws-sdk/client-cognito-identity-provider"

const getUserPoolId = () => awsManagerInstance.getSecretValue("cognito_user_pool_id")
const getUserClientId = () => awsManagerInstance.getSecretValue("cognito_user_client_id")
const getAdminClientId = () => awsManagerInstance.getSecretValue("cognito_admin_client_id")

/** Refresh tokens are bound to their issuing app client, so this must match. */
const getClientId = (client: AuthClient) =>
  client === "userpass" ? getAdminClientId() : getUserClientId()

export const authDao = {
  getUserByPhone: async ({ phone }: { phone: string }) => {
    const list = await AWSManager.cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: await getUserPoolId(),
        Filter: `phone_number = "${phone}"`,
        Limit: 1,
      }),
    )
    return list.Users?.[0]?.Username
  },
  createUser: async ({
    cognitoUsername,
    attributes,
  }: {
    cognitoUsername: string
    attributes: AttributeType[]
  }) => {
    return await AWSManager.cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: await getUserPoolId(),
        Username: cognitoUsername,
        UserAttributes: attributes,
        MessageAction: "SUPPRESS",
      }),
    )
  },
  setUserPassword: async ({
    cognitoUsername,
    password,
  }: {
    cognitoUsername: string
    password: string
  }) => {
    return await AWSManager.cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: await getUserPoolId(),
        Username: cognitoUsername,
        Password: password,
        Permanent: true,
      }),
    )
  },
  addUserToGroup: async ({
    cognitoUsername,
    groupName,
  }: {
    cognitoUsername: string
    groupName: RoleName
  }) => {
    return await AWSManager.cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: await getUserPoolId(),
        Username: cognitoUsername,
        GroupName: groupName,
      }),
    )
  },
  getUser: async ({ cognitoUsername }: { cognitoUsername: string }) => {
    return await AWSManager.cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: await getUserPoolId(),
        Username: cognitoUsername,
      }),
    )
  },
  getCognitoUserIdWithUsername: async ({ cognitoUsername }: { cognitoUsername: string }) => {
    const user = await authDao.getUser({ cognitoUsername })
    return user.UserAttributes?.find((attr) => attr.Name === "sub")?.Value
  },
  userExists: async ({ cognitoUsername }: { cognitoUsername: string }) => {
    try {
      await authDao.getUser({ cognitoUsername })
      return true
    } catch (e) {
      if (e instanceof UserNotFoundException) return false
      throw e
    }
  },
  getUserStatus: async ({ cognitoUsername }: { cognitoUsername: string }) => {
    try {
      const user = await authDao.getUser({ cognitoUsername })
      return user.UserStatus
    } catch (e) {
      if (e instanceof UserNotFoundException) return undefined
      throw e
    }
  },
  listGroupsForUser: async ({ cognitoUsername }: { cognitoUsername: string }) => {
    const response = await AWSManager.cognitoClient.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: await getUserPoolId(),
        Username: cognitoUsername,
      }),
    )
    return response.Groups || []
  },
  initiateAuth: async ({
    authFlow,
    authParameters,
    client = "otp",
  }: {
    authFlow: "CUSTOM_AUTH" | "REFRESH_TOKEN_AUTH"
    authParameters: Record<string, string>
    client?: AuthClient
  }) => {
    return await AWSManager.cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: authFlow,
        ClientId: await getClientId(client),
        AuthParameters: authParameters,
      }),
    )
  },
  respondToAuthChallenge: async ({
    session,
    challengeResponses,
  }: {
    session: string
    challengeResponses: Record<string, string>
  }) => {
    return await AWSManager.cognitoClient.send(
      new RespondToAuthChallengeCommand({
        ChallengeName: "CUSTOM_CHALLENGE",
        ClientId: await getUserClientId(),
        Session: session,
        ChallengeResponses: challengeResponses,
      }),
    )
  },
  adminInitiateAuth: async ({ username, password }: { username: string; password: string }) => {
    return await AWSManager.cognitoClient.send(
      new AdminInitiateAuthCommand({
        UserPoolId: await getUserPoolId(),
        ClientId: await getAdminClientId(),
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      }),
    )
  },
  globalSignOut: async ({ accessToken }: { accessToken: string }) => {
    return await AWSManager.cognitoClient.send(
      new GlobalSignOutCommand({ AccessToken: accessToken }),
    )
  },
}
