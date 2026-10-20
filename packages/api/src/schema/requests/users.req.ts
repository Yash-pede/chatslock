import z from "zod";
import {baseSchema} from "./base"
import {fullName, imageUrl, userId, username} from "../user.schema";

const str = (min = 1, max = 255) => z.string().min(min).max(max);
const usernamePipe = username.toLowerCase();

// SCHEMAS

export const userSearchSchema = baseSchema.extend({
    query: z.strictObject({
        role: z.enum(["admin", "moderator", "agent", "user"]).optional(),
        query: str(3, 20)
    })
});

export const userOnboardingSchema = baseSchema.extend({
    body: z.strictObject({
        username: usernamePipe,
        fullName,
        agentId: z.optional(userId),
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


export type userOnboardingSchema = z.infer<typeof userOnboardingSchema>;
