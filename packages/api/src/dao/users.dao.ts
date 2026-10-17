import {
    CreateUserInput,
    UpdateUserInput,
    User,
    usernamesTableName,
    usersIndexes,
    usersTableName,
} from "../types";
import {AWSManager} from "../utils";
import {
    GetItemCommand,
    QueryCommand,
    TransactWriteItemsCommand,
    UpdateItemCommand,
    type TransactWriteItem,
    type UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import {marshall, unmarshall} from "@aws-sdk/util-dynamodb";

/** Usernames are unique case-insensitively, so the reservation key is lowercased. */
export const normalizeUsername = (username: string) => username.trim().toLowerCase();

const usernameTakenError = (username?: string) =>
    Object.assign(new Error(`Username "${username}" is already taken`), {code: "USERNAME_TAKEN"});

/** True when a username uniqueness reservation rejected the write. */
export const isUsernameTakenError = (err: unknown) =>
    err instanceof Error && (err as { code?: string }).code === "USERNAME_TAKEN";

const isTransactionCancelled = (err: unknown) =>
    err instanceof Error && err.name === "TransactionCanceledException";

/**
 * Turns `[["fullName", "Ana"], ["role", "user"]]` into the three pieces a
 * DynamoDB update needs:
 *
 *   UpdateExpression:            "SET #f0 = :v0, #f1 = :v1"
 *   ExpressionAttributeNames:    { "#f0": "fullName", "#f1": "role" }
 *   ExpressionAttributeValues:   { ":v0": {S: "Ana"}, ":v1": {S: "user"} }
 *
 * Names and values are always replaced by `#fN` / `:vN` because raw attribute
 * names can clash with DynamoDB reserved words (role, status, ...).
 */
const buildUpdate = (entries: [string, unknown][]) => ({
    UpdateExpression: `SET ${entries.map(([,], i) => `#f${i} = :v${i}`).join(", ")}`,
    ExpressionAttributeNames: Object.fromEntries(entries.map(([key], i) => [`#f${i}`, key])),
    ExpressionAttributeValues: Object.fromEntries(
        entries.map(([, value], i) => [`:v${i}`, marshall({value}).value!]),
    ),
} satisfies Omit<UpdateItemCommandInput, "TableName" | "Key">);

const reservationPut = ({username, userId}: {
    username: string;
    userId: string;
}) => ({
    Put: {
        TableName: usernamesTableName,
        Item: marshall({username, userId, createdAt: Date.now()}),
        ConditionExpression: "attribute_not_exists(#username)",
        ExpressionAttributeNames: {"#username": "username"},
    },
} satisfies TransactWriteItem);

const reservationDelete = ({username, userId}: {
    username: string;
    userId: string;
}) => ({
    Delete: {
        TableName: usernamesTableName,
        Key: marshall({username}),
        ConditionExpression: "attribute_exists(#username) AND #userId = :userId",
        ExpressionAttributeNames: {"#username": "username", "#userId": "userId"},
        ExpressionAttributeValues: marshall({":userId": userId}),
    },
} satisfies TransactWriteItem);

/** Throws when `username` is reserved by a different user; the transaction is the real guard. */
const assertUsernameAvailable = async ({username, userId}: {
    username: string;
    userId: string;
}) => {
        const {Item} = await AWSManager.dynamodbClient.send(
            new GetItemCommand({
                TableName: usernamesTableName,
                Key: marshall({username}),
            })
        );

        const ownerId = Item ? unmarshall(Item).userId : undefined;
    if (ownerId && ownerId !== userId) {
        throw usernameTakenError(username);
    }
};

/**
 * Writes the username on the user row and moves its reservation in `usernames`
 * in one transaction, so the two can never disagree:
 *   - `Put` the new reservation (fails if someone else owns the username)
 *   - `Delete` the old reservation, if this is a rename
 *   - `Update` the user row
 * A cancelled transaction means the username was taken between our check and
 * the write, which surfaces as the 409 the service maps.
 */
const reserveUsername = async ({userId, username, previousUsername, userUpdate}: {
    userId: string;
    username: string;
    previousUsername?: string;
    userUpdate: Omit<NonNullable<TransactWriteItem["Update"]>, "TableName" | "Key">;
}) => {
    await assertUsernameAvailable({username, userId});

    const TransactItems: TransactWriteItem[] = [
        {
            Update: {
                TableName: usersTableName,
                Key: marshall({userId}),
                ...userUpdate,
            },
        },
        reservationPut({username, userId}),
    ];

    if (previousUsername) {
        TransactItems.push(reservationDelete({username: previousUsername, userId}));
    }

    try {
        await AWSManager.dynamodbClient.send(
            new TransactWriteItemsCommand({TransactItems})
        );
    } catch (err) {
        if (isTransactionCancelled(err)) throw usernameTakenError(username);
        throw err;
    }
};

export const usersDao = {
    getUserById: async ({userId}: { userId: string }) => {
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
    getUserByUsername: async ({username}: { username: string }) => {
        const result = await AWSManager.dynamodbClient.send(
            new QueryCommand({
                TableName: usersTableName,
                IndexName: usersIndexes.username,
                KeyConditionExpression: "#username = :username",
                ExpressionAttributeNames: {"#username": "username"},
                ExpressionAttributeValues: marshall({":username": normalizeUsername(username)}),
                Limit: 1,
            })
        );

        const item = result.Items?.[0];
        return item ? (unmarshall(item) as User) : undefined;
    },
    updateUser: async ({userId, username, ...updates}: UpdateUserInput) => {
        const entries = Object.entries({...updates, username}).filter(([, value]) => value !== undefined);
        if (entries.length === 0) return;

        const userUpdate = buildUpdate(entries);

        // No username involved: a plain "set these fields" update.
        if (username === undefined) {
            return await AWSManager.dynamodbClient.send(
                new UpdateItemCommand({
                    TableName: usersTableName,
                    Key: marshall({userId}),
                    ...userUpdate,
                })
            );
        }

        // With a username we also have to keep the `usernames` reservation in sync.
        const current = await usersDao.getUserById({userId});
        const previousUsername = current?.username ? normalizeUsername(current.username) : undefined;
        const nextUsername = normalizeUsername(username);
        const isRename = previousUsername !== undefined && previousUsername !== nextUsername;

        if (!isRename) {
            // First claim, or the username is already ours: only stamp it on the row.
            return await reserveUsername({
                userId,
                username: nextUsername,
                userUpdate: previousUsername
                    ? userUpdate
                    : {
                        ...userUpdate,
                        ConditionExpression: "attribute_not_exists(#username)",
                        ExpressionAttributeNames: {...userUpdate.ExpressionAttributeNames, "#username": "username"},
                    },
            });
        }

        // Rename: move the reservation, and refuse if this user was renamed
        // by another request between our read and this write.
        return await reserveUsername({
            userId,
            username: nextUsername,
            previousUsername,
            userUpdate: {
                ...userUpdate,
                ConditionExpression: "attribute_not_exists(#username) OR #username = :previousUsername",
                ExpressionAttributeNames: {...userUpdate.ExpressionAttributeNames, "#username": "username"},
                ExpressionAttributeValues: {
                    ...userUpdate.ExpressionAttributeValues,
                    ...marshall({":previousUsername": current?.username as string}),
                },
            },
        });
    },
    createUserWithConversation: async ({userId, username, ...fields}: CreateUserInput) => {
        const normalizedUsername = normalizeUsername(username);
        await assertUsernameAvailable({username: normalizedUsername, userId});

        const now = Date.now();
        const attrs = Object.fromEntries(
            Object.entries({...fields, username: normalizedUsername}).filter(([, value]) => value !== undefined),
        );

        try {
            await AWSManager.dynamodbClient.send(
                new TransactWriteItemsCommand({
                    TransactItems: [
                        {
                            Put: {
                                TableName: usersTableName,
                                Item: marshall({userId, ...attrs, createdAt: now, updatedAt: now}),
                                ConditionExpression: "attribute_not_exists(#userId)",
                                ExpressionAttributeNames: {"#userId": "userId"},
                            },
                        },
                        reservationPut({username: normalizedUsername, userId}),
                    ],
                })
            );
        } catch (err) {
            if (isTransactionCancelled(err)) throw usernameTakenError(normalizedUsername);
            throw err;
        }
    },
}
