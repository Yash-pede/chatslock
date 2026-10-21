import {usersDao, authDao, conversationsDao} from "@repo/api/dao";
import {HTTPException} from "hono/http-exception";

export const onboardUser = async ({userId, cognitoUsername, fullName, username, agentId}: {
    userId: string;
    cognitoUsername: string;
    fullName: string;
    username: string;
    agentId?: string;
}) => {
    try {
        await authDao.addUserToGroup({cognitoUsername, groupName: "user"});
        await usersDao.createUser({
            userId,
            cognitoUsername,
            fullName,
            username,
            role: "user",
            phone: cognitoUsername.split("_")[1], // extracting phone number
            ...(agentId !== undefined ? {agentId} : {}),
        });

        if (agentId) {
            try {
                await conversationsDao.createDirectConversation([userId, agentId]);
            } catch (err) {
                console.error("Failed to start conversation", err);
                return "user Onboarding completed but failed to start conversation"
            }
        }

        return "user Onboarding completed successfully"
    } catch (err) {
        console.error("Failed to onboard user", err);
        if (err instanceof HTTPException) throw err;

        throw new HTTPException(500, {
            message: "Failed to onboard user",
        });
    }
}

export const getUserById = async ({userId}: { userId: string }) => {
    const user = await usersDao.getUserById({userId});
    if (!user) {
        throw new HTTPException(404, {message: "User not found"});
    }
    return user;
}
