import type {Context} from "hono";
import {conversationListSchema} from "@repo/api/schema";
import {listUserConversations} from "./conversations.service";

export const conversationsListController = async (c: Context) => {
    const {query}: conversationListSchema = c.get("valid");

    const resp = await listUserConversations({
        userId: c.get("userId"),
        limit: query.limit,
        cursor: query.cursor,
    });

    return c.json(resp);
}
