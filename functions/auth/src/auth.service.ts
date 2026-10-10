import {
    AdminCreateUserCommand, AdminListGroupsForUserCommand,
    InitiateAuthCommand,
    ListUsersCommand,
    RespondToAuthChallengeCommand,
    GlobalSignOutCommand
} from "@aws-sdk/client-cognito-identity-provider";
import {AWSManager, awsManagerInstance} from "@repo/api/utils"
import {HTTPException} from 'hono/http-exception'

export async function sendOtp(phone: string) {
    const username = await getOrCreateUserByPhone(phone);
    const clientId = await awsManagerInstance.getSecretValue("cognito_user_client_id")
    try {
        const response = await AWSManager.cognitoClient.send(
            new InitiateAuthCommand({
                AuthFlow: "CUSTOM_AUTH",
                ClientId: clientId,
                AuthParameters: {
                    USERNAME: username,
                },
            }),
        );

        return {
            ...response,
            username,
        };
    } catch (e) {
        throw new HTTPException(500, {message: "unable to send otp."});
    }
}

export const verifyOtp = async (
    otp: string,
    username: string,
    session: string,
) => {
    try {
        const clientId = await awsManagerInstance.getSecretValue("cognito_user_client_id")
        return await AWSManager.cognitoClient.send(
            new RespondToAuthChallengeCommand({
                ChallengeName: "CUSTOM_CHALLENGE",
                ClientId: clientId,
                Session: session,
                ChallengeResponses: {
                    USERNAME: username,
                    ANSWER: otp,
                }
            })
        )
    } catch (err) {
        throw new HTTPException(500, {message: "unable to verify otp."});
    }
}


export const getOrCreateUserByPhone = async (phone: string) => {
    const userPoolId = await awsManagerInstance.getSecretValue("cognito_user_pool_id")

    const list = await AWSManager.cognitoClient.send(
        new ListUsersCommand({
            UserPoolId: userPoolId,
            Filter: `phone_number = "${phone}"`,
            Limit: 1,
        }),
    );

    if (list.Users && list.Users.length > 0) {
        return list.Users[0].Username!;
    }

    const username = crypto.randomUUID();

    await AWSManager.cognitoClient.send(
        new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: username,
            UserAttributes: [
                {Name: "phone_number", Value: phone},
                {Name: "phone_number_verified", Value: "true"},
            ],
            MessageAction: "SUPPRESS",
        }),
    );

    return username;
}


export async function getCognitoUserGroups(username: string) {
    const userPoolId = await awsManagerInstance.getSecretValue("cognito_user_pool_id")
    const response = await AWSManager.cognitoClient.send(
        new AdminListGroupsForUserCommand({
            UserPoolId: userPoolId,
            Username: username,
        }),
    );

    return response.Groups || [];
}

export async function cognitoRefreshCall(refreshToken: string) {
    const clientId = await awsManagerInstance.getSecretValue("cognito_user_client_id");

    return await AWSManager.cognitoClient.send(
        new InitiateAuthCommand({
            AuthFlow: "REFRESH_TOKEN_AUTH",
            ClientId: clientId,
            AuthParameters: {
                REFRESH_TOKEN: refreshToken,
            },
        }),
    );
}

export async function cognitoLogout(accessToken: string) {
    return await AWSManager.cognitoClient.send(
        new GlobalSignOutCommand({
            AccessToken: accessToken,
        })
    )
}