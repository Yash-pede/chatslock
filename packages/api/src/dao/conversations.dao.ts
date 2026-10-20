import z from "zod"
import {buildKey, CONVERSATION_SK, conversationSchema, PREFIXES, TABLE_NAME, USER_SK, userId} from "../schema";
import * as crypto from "node:crypto";
import {AWSManager, parseOrThrow} from "../utils";
import {BatchWriteCommand, QueryCommand} from "@aws-sdk/lib-dynamodb";
import {Conversation} from "../types";

export const conversationsDao = {
    createDirectConversation: async (userIds: [z.infer<typeof userId>, z.infer<typeof userId>]): Promise<string> => {

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
                                Item: {
                                    PK: buildKey(PREFIXES.USER, id),
                                    SK: buildKey(PREFIXES.CONVERSATION, type, conversationId),
                                    member_user: buildKey(PREFIXES.MEMBER, id),
                                }
                            }
                        }))
                    ]
                }
            })
        );

        return conversationId;

    },
    getConversationsByUserId: async (id: z.infer<typeof userId>) => {
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
        return resp.Items?.map((item) => parseOrThrow(conversationSchema, item));
    }
}
