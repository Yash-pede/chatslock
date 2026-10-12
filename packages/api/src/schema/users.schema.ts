import z from "zod";
import {baseSchema} from "./base"

const str = (min = 1, max = 255) => z.string().min(min).max(max);
const cognitoIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fullName = str(3, 50);
const username = str(3, 20);
const imageUrl = z.url("Invalid image URL format");
const userId = z.string().regex(cognitoIdRegex, "Invalid userId")


// SCHEMAS

export const userSearchSchema = baseSchema.extend({
    query: z.strictObject({
        role: z.enum(["admin", "moderator", "agent", "user"]).optional(),
        query: str(3, 20)
    })
});

export const userOnboardingSchema = baseSchema.extend({
    body: z.strictObject({
        username,
        fullName,
        agentId: userId,
    })
});

export const getUserProfileImagePresignUrlSchema = baseSchema.extend({
    body: z.strictObject({
        contentType: str(),
        fileName: str()
    })
});

export const updateUserProfileSchema = baseSchema.extend({
    body: z.strictObject({
        fullName: fullName.optional(),
        imageUrl: imageUrl.optional(),
        otherUserId: userId.optional()
    })
});

export const getConversationByUserIdSchema = baseSchema.extend({
    params: z.strictObject({userId})
});

export type userOnboardingSchema = z.infer<typeof userOnboardingSchema>;
