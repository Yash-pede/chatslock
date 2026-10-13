import {AWSManager, awsManagerInstance} from "@repo/api/utils";
import {AdminAddUserToGroupCommand} from "@aws-sdk/client-cognito-identity-provider"
import {usersDao} from "./users.dao";
import {HTTPException} from "hono/http-exception";

export const onboardUser = async ({cognitoUsername, fullName, username}: {
    cognitoUsername: string;
    fullName: string;
    username: string
}) => {
    try {
        const userPoolId = await awsManagerInstance.getSecretValue("cognito_user_pool_id")
        const [cognito, userUpdate] = Promise.all([
            AWSManager.cognitoClient.send(
                new AdminAddUserToGroupCommand({
                    UserPoolId: userPoolId,
                    Username: cognitoUsername,
                    GroupName: "user",
                }),
            ),
            usersDao.updateUser({
                userId: cognitoUsername,
                fullName,
                username,
                role: "user"
            })])
        return "user Onboarding completed successfully"
    } catch (err) {
        console.error("Failed to onboard user", err);

        throw new HTTPException(500, {
            message: "Failed to onboard user",
        });
    }
}