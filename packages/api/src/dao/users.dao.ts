import {UpdateUserInput, usersTableName} from "../types";
import {AWSManager} from "../utils";
import {UpdateItemCommand} from "@aws-sdk/client-dynamodb";
import {marshall} from "@aws-sdk/util-dynamodb";

export const usersDao = {
    updateUser: async ({userId, ...updates}: UpdateUserInput) => {
        const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
        if (entries.length === 0) return;

        const values = marshall(Object.fromEntries(entries));

        return await AWSManager.dynamodbClient.send(
            new UpdateItemCommand({
                TableName: usersTableName,
                Key: marshall({userId}),
                UpdateExpression: `SET ${entries.map(([key], i) => `#f${i} = :v${i}`).join(", ")}`,
                ExpressionAttributeNames: Object.fromEntries(entries.map(([key], i) => [`#f${i}`, key])),
                ExpressionAttributeValues: Object.fromEntries(entries.map(([key], i) => [`:v${i}`, values[key]!])),
            })
        )
    },
    createUserWithConversation: async ({
        userId,
        agentId,
    }: { userId: string; agentId: string }) => {

        return {userId, agentId};
    }
}
