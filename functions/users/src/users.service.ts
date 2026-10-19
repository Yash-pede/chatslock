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
        // TODO: create the users DAO object for the single-table design, then restore this call.
        // await usersDao.updateUser({
        //     userId,
        //     cognitoUsername,
        //     fullName,
        //     username,
        //     role: "user",
        //     agentId,
        // });

        if (agentId) {
            // TODO: create the conversations DAO object for the single-table design, then restore this call.
            // await conversationsDao.createConversation({
            //     type: "direct",
            //     createdBy: userId,
            //     assignedAgentId: agentId,
            // });
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
    // TODO: create the users DAO object for the single-table design, then restore this call.
    // const user = await usersDao.getUserById({userId});
    const user = undefined as Awaited<ReturnType<typeof usersDao.getUserById>>;
    if (!user) {
        throw new HTTPException(404, {message: "User not found"});
    }
    return user;
}
