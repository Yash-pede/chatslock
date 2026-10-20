import type z from "zod";
import type {conversationItem, ConversationType} from "../schema";

/** A row in the conversations table; partition key `CONVERSATION#<conversationId>`, sort key `METADATA`. */
export type Conversation = z.infer<typeof conversationItem>;

export type {ConversationType};
