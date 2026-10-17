import {
    Conversation,
    CreateConversationInput,
    conversationParticipantIndexes,
    conversationParticipantsTableName,
    conversationsTableName,
} from "../types";
import {AWSManager} from "../utils";
import {
    BatchGetItemCommand,
    QueryCommand,
    TransactWriteItemsCommand,
    type AttributeValue,
    type TransactWriteItem,
} from "@aws-sdk/client-dynamodb";
import {marshall, unmarshall} from "@aws-sdk/util-dynamodb";

const encodeCursor = (key: Record<string, AttributeValue>) =>
    Buffer.from(JSON.stringify(key)).toString("base64");

const decodeCursor = (cursor?: string) => {
    if (!cursor) return undefined;
    try {
        return JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) as Record<string, AttributeValue>;
    } catch {
        throw new Error("Invalid pagination cursor");
    }
};

export const conversationsDao = {
    createConversation: async (fields: CreateConversationInput) => {
        const {participantIds, ...conversationFields} = fields;
        const now = Date.now();
        const conversationId = crypto.randomUUID();

        const conversation = {
            conversationId,
            isClosed: false,
            lastMessageAt: now,
            ...Object.fromEntries(
                Object.entries(conversationFields).filter(([, value]) => value !== undefined),
            ),
            createdAt: now,
            updatedAt: now,
        };

        const createdBy = conversationFields.createdBy;
        const memberIds = Array.from(
            new Set(
                [createdBy, conversationFields.assignedAgentId, ...(participantIds ?? [])]
                    .filter((id): id is string => typeof id === "string" && id.length > 0),
            ),
        );

        const participantPuts: TransactWriteItem[] = memberIds.map((userId) => ({
            Put: {
                TableName: conversationParticipantsTableName,
                Item: marshall({
                    conversationId,
                    userId,
                    role: userId === createdBy ? "owner" : "member",
                    muted: false,
                    unreadCount: 0,
                    notificationsEnabled: true,
                    joinedAt: now,
                }),
            },
        }));

        const TransactItems: TransactWriteItem[] = [
            {
                Put: {
                    TableName: conversationsTableName,
                    Item: marshall(conversation),
                },
            },
            ...participantPuts,
        ];

        await AWSManager.dynamodbClient.send(
            new TransactWriteItemsCommand({TransactItems}),
        );

        return conversation;
    },

    getConversationsByUser: async ({userId, limit = 20, cursor}: {
        userId: string;
        limit?: number;
        cursor?: string;
    }) => {
        const participants = await AWSManager.dynamodbClient.send(
            new QueryCommand({
                TableName: conversationParticipantsTableName,
                IndexName: conversationParticipantIndexes.user,
                KeyConditionExpression: "#userId = :userId",
                ExpressionAttributeNames: {"#userId": "userId"},
                ExpressionAttributeValues: marshall({":userId": userId}),
                Limit: limit,
                ExclusiveStartKey: decodeCursor(cursor),
            })
        );

        const conversationIds = (participants.Items ?? [])
            .map((item) => item.conversationId?.S)
            .filter((id): id is string => Boolean(id));

        let conversations: Conversation[] = [];
        if (conversationIds.length > 0) {
            const batch = await AWSManager.dynamodbClient.send(
                new BatchGetItemCommand({
                    RequestItems: {
                        [conversationsTableName]: {
                            Keys: conversationIds.map((conversationId) => marshall({conversationId})),
                        },
                    },
                })
            );

            conversations = (batch.Responses?.[conversationsTableName] ?? []).map(
                (item) => unmarshall(item) as Conversation,
            );
        }

        conversations.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));

        return {
            conversations,
            nextCursor: participants.LastEvaluatedKey
                ? encodeCursor(participants.LastEvaluatedKey)
                : null,
        };
    }
}
