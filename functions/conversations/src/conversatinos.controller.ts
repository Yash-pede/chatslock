import type {Context} from "hono"
import type {GetChatPageConversationRequest} from "@repo/types/req";
import {chatPageConversationsService} from "./conversatinos.service";

export const chatPageConversationsController = async (c: Context) => {
    const {query}: GetChatPageConversationRequest = c.get("valid");
    const resp = await chatPageConversationsService({
        userId: c.get("userId"),
        pageSize: query.pageSize,
        startKey: query.startKey,
    });

    return c.json(resp);
}
