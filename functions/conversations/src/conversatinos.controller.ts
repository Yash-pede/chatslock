import type {Context} from "hono"
import type {GetChatPageConversationInput} from "@repo/api/schema/requests";
import {chatPageConversationsService} from "./conversatinos.service";

export const chatPageConversationsController = async (c: Context) => {
    const {query}: GetChatPageConversationInput = c.get("valid");
    const resp = await chatPageConversationsService({
        userId: c.get("userId"),
        pageSize: query.pageSize,
        startKey: query.startKey,
    });

    return c.json(resp);
}
