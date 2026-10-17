import {CreateUserInput, UpdateUserInput, User, usersTableName} from "../types";
import {AWSManager} from "../utils";
import {PutItemCommand, QueryCommand, UpdateItemCommand} from "@aws-sdk/client-dynamodb";
import {marshall, unmarshall} from "@aws-sdk/util-dynamodb";

export const usersDao = {
    getUserById: async ({userId}: {userId: string}) => {
        const result = await AWSManager.dynamodbClient.send(
            new QueryCommand({
                TableName: usersTableName,
                KeyConditionExpression: "#userId = :userId",
                ExpressionAttributeNames: {"#userId": "userId"},
                ExpressionAttributeValues: marshall({":userId": userId}),
                Limit: 1,
            })
        );

        const item = result.Items?.[0];
        return item ? (unmarshall(item) as User) : undefined;
    },
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
    createUserWithConversation: async ({userId, ...fields}: CreateUserInput) => {
        const now = Date.now();
        const attrs = Object.fromEntries(
            Object.entries(fields).filter(([, value]) => value !== undefined),
        );

        return await AWSManager.dynamodbClient.send(
            new PutItemCommand({
                TableName: usersTableName,
                Item: marshall({
                    userId,
                    ...attrs,
                    createdAt: now,
                    updatedAt: now,
                }),
            })
        )
    }
}
