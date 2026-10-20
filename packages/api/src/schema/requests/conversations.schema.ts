import {z} from "zod"
import {baseSchema} from "./base"

const cursor = z.string().max(4096).optional();

export const conversationListSchema = baseSchema.extend({
    query: z.strictObject({
        limit: z.coerce.number().int().min(1).max(25).default(20),
        cursor,
    })
});

export type conversationListSchema = z.infer<typeof conversationListSchema>;
