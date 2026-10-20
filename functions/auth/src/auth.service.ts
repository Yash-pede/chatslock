import {HTTPException} from "hono/http-exception";
import {authDao, usersDao} from "@repo/api/dao";
import type {RoleName} from "@repo/types/schema";

export async function sendOtp(phone: string) {
    const username = await getOrCreateUserByPhone(phone);
    try {
        const response = await authDao.initiateAuth({
            authFlow: "CUSTOM_AUTH",
            authParameters: {USERNAME: username},
        });

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
        return await authDao.respondToAuthChallenge({
            session,
            challengeResponses: {
                USERNAME: username,
                ANSWER: otp,
            },
        });
    } catch (err) {
        throw new HTTPException(500, {message: "unable to verify otp."});
    }
};

export const getOrCreateUserByPhone = async (phone: string) => {
    const existing = await authDao.getUserByPhone({phone});
    if (existing) return existing;

    const cognitoUsername = `user_${phone}`;

    await authDao.createUser({
        cognitoUsername,
        attributes: [
            {Name: "phone_number", Value: phone},
            {Name: "phone_number_verified", Value: "true"},
        ],
    });

    return cognitoUsername;
};

export async function getCognitoUserGroups(username: string) {
    return await authDao.listGroupsForUser({cognitoUsername: username});
}

export async function cognitoRefreshCall(refreshToken: string) {
    return await authDao.initiateAuth({
        authFlow: "REFRESH_TOKEN_AUTH",
        authParameters: {REFRESH_TOKEN: refreshToken},
    });
}

export async function cognitoLogout(accessToken: string) {
    return await authDao.globalSignOut({accessToken});
}

export async function adminCreateUser(
    username: string,
    password: string,
    role: string,
    fullName?: string,
) {
    const status = await authDao.getUserStatus({cognitoUsername: username});

    // A leftover FORCE_CHANGE_PASSWORD user is a half-finished create (e.g. the
    // password failed the pool policy after AdminCreateUser succeeded), so
    // resume it instead of failing. Anything else is a real duplicate.
    if (status && status !== "FORCE_CHANGE_PASSWORD") {
        throw new HTTPException(409, {message: "User already exists"});
    }

    if (!status) {
        await authDao.createUser({
            cognitoUsername: username,
            attributes: [{Name: "given_name", Value: fullName || ""}],
        });
    }

    await authDao.setUserPassword({cognitoUsername: username, password});
    await authDao.addUserToGroup({cognitoUsername: username, groupName: role as RoleName});

    const userId = await authDao.getCognitoUserIdWithUsername({cognitoUsername: username});

    if (!userId) throw new HTTPException(500, {message: "Unable to create user"})
    await usersDao.createUser({
        userId,
        cognitoUsername: username,
        username,
        fullName: fullName || "",
        role: role as RoleName,
    });

    return await authDao.adminInitiateAuth({username, password});
}
