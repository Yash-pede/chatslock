import {PutCommand, QueryCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {
    createUserSchema,
    PREFIXES,
    TABLE_NAME,
    USER_SK,
    updateUserSchema,
    userItem,
    userSchema,
    USERNAME_GSI,
    getUserSchema,
    type CreateUserInput,
    type UpdateUserInput,
    type User,
} from "@repo/types/schema";
import z from "zod";
import {AWSManager, buildKey, definedEntries, parseOrThrow} from "../utils";

/** Key of a user's profile item: `PK USER#<userId>`, `SK PROFILE`. */
const userKey = (userId: string) => ({PK: buildKey(PREFIXES.USER, userId), SK: USER_SK[0]});

export const usersDao = {
    getUserById: async (input: { userId: string }): Promise<z.infer<typeof getUserSchema> | undefined> => {
        const result = await AWSManager.dbClient.send(
            new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: "#pk = :pk AND #sk = :sk",
                ExpressionAttributeNames: {"#pk": "PK", "#sk": "SK"},
                ExpressionAttributeValues: {":pk": buildKey(PREFIXES.USER, input.userId), ":sk": USER_SK[0]}
            })
        )

        const item = result.Items?.[0];
        return item === undefined ? undefined : parseOrThrow(getUserSchema, item);
    },
    getUserByUsername: async (input: { username: string }) => {

        const result = await AWSManager.dbClient.send(
            new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: USERNAME_GSI,

                KeyConditionExpression: "#sk = :sk AND #username = :username",
                ExpressionAttributeNames: {
                    "#sk": "SK",
                    "#username": "username",
                },
                ExpressionAttributeValues: {
                    ":sk": USER_SK[0],
                    ":username": input.username.toLowerCase(),
                },
            })
        );

        return result.Items?.map((item) => parseOrThrow(userSchema, item));
    },
    updateUser: async (input: UpdateUserInput): Promise<void> => {
        const {userId} = parseOrThrow(updateUserSchema, input);
        const attributes = definedEntries(input, ["userId"]);

        const sets = attributes.map(([field]) => `#${field} = :${field}`);

        await AWSManager.dbClient.send(
            new UpdateCommand({
                TableName: TABLE_NAME,
                Key: userKey(userId),
                UpdateExpression: `SET #updatedAt = :updatedAt${sets.map((set) => `, ${set}`).join("")}`,
                ConditionExpression: "attribute_exists(PK)",
                ExpressionAttributeNames: {
                    "#updatedAt": "updatedAt",
                    ...Object.fromEntries(attributes.map(([field]) => [`#${field}`, field])),
                },
                ExpressionAttributeValues: {
                    ":updatedAt": Date.now(),
                    ...Object.fromEntries(attributes.map(([field, value]) => [`:${field}`, value])),
                },
            }),
        );
    },
    createUser: async (input: CreateUserInput): Promise<void> => {
        const data = parseOrThrow(createUserSchema, input);
        const now = Date.now();

        const item = parseOrThrow(userItem, {
            ...userKey(data.userId),
            ...data,
            createdAt: now,
            updatedAt: now,
        });

        await AWSManager.dbClient.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: item,
                ConditionExpression: "attribute_not_exists(PK)",
            }),
        );
    },
};
