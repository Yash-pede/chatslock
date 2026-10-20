import z from "zod"
import {TABLE_NAME, toConversationKeys, toUserKeys, userId} from "../schema";
import * as crypto from "node:crypto";
import {AWSManager} from "../utils";
import {BatchWriteCommand, PutCommand} from "@aws-sdk/lib-dynamodb";

export const conversationsDao = {
    createDirectConversation: async (userIds: [z.infer<typeof userId>, z.infer<typeof userId>]): Promise<string> => {

        const conversationId = crypto.randomUUID();
        const now = Date.now();

        await AWSManager.dbClient.send(
            new BatchWriteCommand({
                RequestItems: {
                    [TABLE_NAME]: [
                        {
                            PutRequest: {
                                Item: {
                                    ...toConversationKeys({conversationId, type: "DIRECT"}),
                                    type: "DIRECT",
                                    createdAt: now,
                                    updatedAt: now,
                                }
                            }
                        },
                        ...userIds.map((id) => ({
                            PutRequest: {
                                Item: {
                                    ...toUserKeys({userId: id, sk: `CONVERSATION#DIRECT#${conversationId}`}),
                                    member_user: `MEMBER#${id}`
                                }
                            }
                        }))
                    ]
                }
            })
        );

        return conversationId;

    }
}