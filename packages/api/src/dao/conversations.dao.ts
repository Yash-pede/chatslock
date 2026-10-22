import {BatchWriteCommand, QueryCommand} from "@aws-sdk/lib-dynamodb";
import {
    CONVERSATION_SK,
    conversationItem,
    PREFIXES,
    TABLE_NAME,
    userMember_conversationItem,
    userMember_conversationSchema,
    type UserMemberConversation,
} from "@repo/types/schema";
import {AWSManager, buildKey, buildConversationId, parseOrThrow, parseConversationKey} from "../utils";

export const conversationsDao = {
    createDirectConversation: async (userIds: [string, string]): Promise<void> => {
        const now = Date.now();
        const type = "DIRECT" as const;
        const sorted = [...userIds].sort();
        const first = sorted[0]!;
        const second = sorted[1]!;
        // Stored as `TYPE#id` (e.g. `DIRECT#u1#u2`), the same composite value the
        // frontend passes back on every messages call; only the storage keys add
        // the `CONVERSATION#` prefix.
        const conversationId = buildConversationId(type, `${first}#${second}`);

        await AWSManager.dbClient.send(
            new BatchWriteCommand({
                RequestItems: {
                    [TABLE_NAME]: [
                        {
                            PutRequest: {
                                Item: parseOrThrow(conversationItem, {
                                    PK: buildKey(PREFIXES.CONVERSATION, type, first, second),
                                    SK: CONVERSATION_SK[0],
                                    conversationId,
                                    conversationType: type,
                                    createdAt: now,
                                    updatedAt: now,
                                })
                            }
                        },
                        ...userIds.map((id) => ({
                            PutRequest: {
                                Item: parseOrThrow(userMember_conversationItem, {
                                    PK: buildKey(PREFIXES.USER, id),
                                    SK: buildKey(PREFIXES.CONVERSATION, type, first, second),
                                    userMember: buildKey(PREFIXES.MEMBER, id),
                                    unreadCount: 0,
                                })
                            }
                        }))
                    ]
                }
            })
        )

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
        return (resp.Items ?? []).map((item) => {
            const stored = parseOrThrow(userMember_conversationItem, item);
            const {type, conversationId} = parseConversationKey(stored.SK);
            return parseOrThrow(userMember_conversationSchema, {
                ...stored,
                conversationType: type,
                conversationId: buildConversationId(type, conversationId),
            });
        });
    },
}
