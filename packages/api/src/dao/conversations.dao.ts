import crypto from "node:crypto";
import {BatchWriteCommand, QueryCommand} from "@aws-sdk/lib-dynamodb";
import {
    CONVERSATION_SK,
    PREFIXES,
    TABLE_NAME,
    userMember_conversationItem,
    userMember_conversationSchema,
    type UserMemberConversation,
} from "@repo/types/schema";
import {AWSManager, buildKey, parseOrThrow} from "../utils";

export const conversationsDao = {
    createDirectConversation: async (userIds: [string, string]): Promise<string> => {

        const conversationId = crypto.randomUUID();
        const now = Date.now();
        const type = "DIRECT" as const;

        await AWSManager.dbClient.send(
            new BatchWriteCommand({
                RequestItems: {
                    [TABLE_NAME]: [
                        {
                            PutRequest: {
                                Item: {
                                    PK: buildKey(PREFIXES.CONVERSATION, type, conversationId),
                                    SK: CONVERSATION_SK[0],
                                    conversationId,
                                    type,
                                    createdAt: now,
                                    updatedAt: now,
                                }
                            }
                        },
                        ...userIds.map((id) => ({
                            PutRequest: {
                                Item: parseOrThrow(userMember_conversationItem, {
                                    PK: buildKey(PREFIXES.USER, id),
                                    SK: buildKey(PREFIXES.CONVERSATION, type, conversationId),
                                    member_user: buildKey(PREFIXES.MEMBER, id),
                                    unreadCount: 0,
                                })
                            }
                        }))
                    ]
                }
            })
        );

        return conversationId;

    },
    getConversationsByUserId: async (id: string): Promise<Array<UserMemberConversation>> => {
        const resp = await AWSManager.dbClient.send(
            new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
                ExpressionAttributeNames: {"#pk": "PK", "#sk": "SK"},
                ExpressionAttributeValues: {
                    ":pk": buildKey(PREFIXES.USER, id),
                    ":sk": PREFIXES.CONVERSATION,
                },
            })
        );
        return (resp.Items ?? []).map((item) => parseOrThrow(userMember_conversationSchema, item));
    }
}
