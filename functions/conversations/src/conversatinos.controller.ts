import type {Context} from "hono"
import type {GetChatPageConversationRequest, GetConversationProfilesRequest} from "@repo/types/req";
import {chatPageConversationsService, conversationProfilesService} from "./conversatinos.service";

export const chatPageConversationsController = async (c: Context) => {
    const {query}: GetChatPageConversationRequest = c.get("valid");
    const resp = await chatPageConversationsService({
        userId: c.get("userId"),
        pageSize: query.pageSize,
        startKey: query.startKey,
    });

    return c.json(resp);
}

/** Batch-resolves the other participant(s) of the listed conversations. */
export const conversationProfilesController = async (c: Context) => {
    const {body}: GetConversationProfilesRequest = c.get("valid");
    const resp = await conversationProfilesService({userIds: body.userIds});

    return c.json(resp);
}
