import {CreateUserInput, UpdateUserInput, User} from "../types";
import {AWSManager} from "../utils";
import {TABLE_NAME} from "../schema";
import {PutCommand} from "@aws-sdk/lib-dynamodb";

/** Usernames are unique case-insensitively, so the reservation key is lowercased. */
export const normalizeUsername = (username: string) => username.trim().toLowerCase();

export const isUsernameTakenError = (err: unknown) =>
    err instanceof Error && (err as { code?: string }).code === "USERNAME_TAKEN";

// TODO: recreate the users DAO against the single-table DynamoDB design.
export const usersDao = {
    getUserById: async (_input: { userId: string }): Promise<User | undefined> => {
        return undefined;
    },
    getUserByUsername: async (_input: { username: string }): Promise<User | undefined> => {
        return undefined;
    },
    updateUser: async (_input: UpdateUserInput): Promise<void> => {
        return;
    },
    createUser: async (input: CreateUserInput): Promise<void> => {

        await AWSManager.dbClient.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `USER#${input.userId}`,
                    SK: "PROFILE",
                    ...input,
                    createdAt: Date.now(),
                }
            })
        )

        return;
    },
}
