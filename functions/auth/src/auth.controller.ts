import {Context} from "hono";
import {initiateOtpSchema, loginSchema, refreshOtpSchema, verifyOtpSchema} from "@repo/api/schema"
import {cognitoLogout, cognitoRefreshCall, getCognitoUserGroups, sendOtp, verifyOtp} from "./auth.service";
import {AdminInitiateAuthCommand} from "@aws-sdk/client-cognito-identity-provider";
import {AWSManager} from "@repo/api/utils";
import {HTTPException} from "hono/http-exception";

export const otpController = async (c: Context) => {
    const {body}: initiateOtpSchema = c.get("valid")

    const resp = await sendOtp(body.phone)
    return c.json({
        session: resp.Session,
        challengeName: resp.ChallengeName,
        username: resp.username,
    })
}

export const verifyOtpController = async (c: Context) => {
    const {body}: verifyOtpSchema = c.get("valid")
    const resp = await verifyOtp(body.otp, body.username, body.session)
    return c.json({
        refreshToken: resp.AuthenticationResult?.RefreshToken,
        accessToken: resp.AuthenticationResult?.AccessToken,
        idToken: resp.AuthenticationResult?.IdToken,
        expiresIn: resp.AuthenticationResult?.ExpiresIn,
    })
}

export const loginController = async (c: Context) => {
    const {body}: loginSchema = c.get("valid")
    body.username = body.username.toLowerCase();
    let role = "";

    try {
        const cognitoUser = await getCognitoUserGroups(body.username);

        role = cognitoUser[0]?.GroupName || "";

        if (role === "user") throw new Error("Not allowed");

        const command = new AdminInitiateAuthCommand({
            UserPoolId: process.env.cognito_user_pool_id,
            ClientId: process.env.cognito_admin_client_id,
            AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
            AuthParameters: {
                USERNAME: body.username,
                PASSWORD: body.password,
            },
        });
        const response = await AWSManager.cognitoClient.send(command);
        const {AccessToken, RefreshToken, IdToken} =
        response.AuthenticationResult || {};

        if (!AccessToken || !RefreshToken) throw new Error("AccessToken not set");

        return c.json({
            refreshToken: response.AuthenticationResult?.RefreshToken,
            accessToken: response.AuthenticationResult?.AccessToken,
            idToken: response.AuthenticationResult?.IdToken,
            expiresIn: response.AuthenticationResult?.ExpiresIn,
        })
    } catch (error: any) {
        throw new HTTPException(500, {message: error.message});
    }
}

export const refreshController = async (c: Context) => {
    const {body}: refreshOtpSchema = c.get("valid");
    const accessToken = c.req.header("Authorization")?.split(" ")[1]
    if (!accessToken) throw new HTTPException(402, {message: "Not allowed"});

    const resp = await cognitoRefreshCall(body.refreshToken, accessToken)
    return c.json({
        accessToken: resp.AuthenticationResult?.AccessToken,
        idToken: resp.AuthenticationResult?.IdToken,
        expiresIn: resp.AuthenticationResult?.ExpiresIn,
    })
}

export const logOutUserController = async (c: Context) => {
    const accessToken = c.req.header("Authorization")?.split(" ")[1]
    const resp = await cognitoLogout(accessToken)
    return c.json({
        message: "Logged out",
    })
}