import z from "zod";
import {baseSchema} from "./base";
import {fullName, imageUrl, role, userId, username} from "../schema";

const str = (min = 1, max = 255) => z.string().min(min).max(max);

export const userSearchSchema = baseSchema.extend({
    query: z.strictObject({
        role: role.optional(),
        query: str(3, 20),
    }),
});

export const userOnboardingSchema = baseSchema.extend({
    body: z.strictObject({
        username: username.toLowerCase(),
        fullName,
        agentId: z.optional(userId),
    }),
});

export const getUserProfileImagePresignUrlSchema = baseSchema.extend({
    body: z.strictObject({
        contentType: str(),
        fileName: str(),
    }),
});

export const updateUserProfileSchema = baseSchema.extend({
    body: z.strictObject({
        fullName: fullName.optional(),
        imageUrl: imageUrl.optional(),
        otherUserId: userId.optional(),
    }),
});

export type UserSearchRequest = z.infer<typeof userSearchSchema>;
export type UserOnboardingRequest = z.infer<typeof userOnboardingSchema>;
export type GetUserProfileImagePresignUrlRequest = z.infer<typeof getUserProfileImagePresignUrlSchema>;
export type UpdateUserProfileRequest = z.infer<typeof updateUserProfileSchema>;
