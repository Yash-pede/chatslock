import {Context} from "hono";
import type {InitiateOtpRequest, LoginRequest, RefreshOtpRequest, VerifyOtpRequest} from "@repo/types/req"
import {
    adminCreateUser,
    cognitoLogout,
    cognitoRefreshCall,
    getCognitoUserGroups,
    sendOtp,
    verifyOtp
} from "./auth.service";
import {AdminInitiateAuthCommand} from "@aws-sdk/client-cognito-identity-provider";
import {awsManagerInstance} from "@repo/api/utils";
import {HTTPException} from "hono/http-exception";

export const otpController = async (c: Context) => {
    const {body}: InitiateOtpRequest = c.get("valid")

    const resp = await sendOtp(body.phone)
    return c.json({
        session: resp.Session,
        challengeName: resp.ChallengeName,
        username: resp.username,
    })
}

export const verifyOtpController = async (c: Context) => {
    const {body}: VerifyOtpRequest = c.get("valid")
    const resp = await verifyOtp(body.otp, body.username, body.session)
    return c.json({
        refreshToken: resp.AuthenticationResult?.RefreshToken,
        accessToken: resp.AuthenticationResult?.AccessToken,
        idToken: resp.AuthenticationResult?.IdToken,
        expiresIn: resp.AuthenticationResult?.ExpiresIn,
        client: "otp" as const,
    })
}

export const loginController = async (c: Context) => {
    const {body}: LoginRequest = c.get("valid")
    body.username = body.username.toLowerCase();

    try {
        const cognitoUser = await getCognitoUserGroups(body.username);
        const isAgent = cognitoUser.some((group) => group.GroupName === "agent");

        if (!isAgent) {
            throw new HTTPException(403, {message: "Use phone sign-in instead."});
        }

        const userPoolId = await awsManagerInstance.getSecretValue("cognito_user_pool_id");
        const clientId = await awsManagerInstance.getSecretValue("cognito_admin_client_id");

        const command = new AdminInitiateAuthCommand({
            UserPoolId: userPoolId,
            ClientId: clientId,
            AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
            AuthParameters: {
                USERNAME: body.username,
                PASSWORD: body.password,
            },
        });
        const response = await awsManagerInstance.cognitoClient.send(command);
        const {AccessToken, RefreshToken} = response.AuthenticationResult || {};

        if (!AccessToken || !RefreshToken) {
            throw new HTTPException(401, {message: "Incorrect username or password."});
        }

        return c.json({
            refreshToken: response.AuthenticationResult?.RefreshToken,
            accessToken: response.AuthenticationResult?.AccessToken,
            idToken: response.AuthenticationResult?.IdToken,
            expiresIn: response.AuthenticationResult?.ExpiresIn,
            client: "userpass" as const,
        })
    } catch (error) {
        if (error instanceof HTTPException) throw error;
        throw new HTTPException(401, {message: "Incorrect username or password."});
    }
}

export const refreshController = async (c: Context) => {
    const {body}: RefreshOtpRequest = c.get("valid");

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
    const {fullName, username, password, role} = await c.req.json()
    const resp = await adminCreateUser(username, password, role, fullName)
    return c.json(resp)
}