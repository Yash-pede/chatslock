import {usersDao, authDao, conversationsDao, isUsernameTakenError} from "@repo/api/dao";
import {ApiException} from "@repo/api/utils";
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
        await usersDao.updateUser({
            userId,
            cognitoUsername,
            fullName,
            username,
            role: "user",
            agentId,
        });

        if (agentId) {
            await conversationsDao.createConversation({
                type: "direct",
                createdBy: userId,
                assignedAgentId: agentId,
            });
        }

        return "user Onboarding completed successfully"
    } catch (err) {
        console.error("Failed to onboard user", err);
        if (err instanceof HTTPException) throw err;
        if (isUsernameTakenError(err)) {
            throw new ApiException(409, {
                code: "USERNAME_TAKEN",
                message: "Username already exists",
            });
        }

        throw new HTTPException(500, {
            message: "Failed to onboard user",
        });
    }
}

export const getUserById = async ({userId}: {userId: string}) => {
    const user = await usersDao.getUserById({userId});
    if (!user) {
        throw new HTTPException(404, {message: "User not found"});
    }
    return user;
}

export const getUserConversations = async ({userId, limit, cursor}: {
    userId: string;
    limit?: number;
    cursor?: string;
}) => {
    return await conversationsDao.getConversationsByUser({userId, limit, cursor});
}
