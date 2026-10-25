import z from "zod"
import { baseSchema } from "./base"
import { avatar, fullName, phone, role, userId, username } from "../schema"

const str = (min = 1, max = 255) => z.string().min(min).max(max)

export const userSearchSchema = baseSchema.extend({
  query: z.strictObject({
    role: role.optional(),
    query: str(3, 20),
  }),
})

export const userOnboardingSchema = baseSchema.extend({
  body: z.strictObject({
    username: username.toLowerCase(),
    fullName,
    phone,
    agentId: z.optional(userId),
  }),
})

export const getUserProfileImagePresignUrlSchema = baseSchema.extend({
  body: z.strictObject({
    contentType: str(),
    fileName: str(),
  }),
})

/**
 * Self-service profile update. The caller can only change their own name and
 * avatar; `otherUserId` is not accepted (it would let a user edit someone else).
 * The avatar is stored as a full URL so clients can render it directly.
 */
export const updateMyProfileSchema = baseSchema.extend({
  body: z
    .strictObject({
      fullName: fullName.optional(),
      avatar: avatar.optional(),
    })
    .refine((body) => body.fullName !== undefined || body.avatar !== undefined, {
      message: "Nothing to update",
    }),
})

/** Confirms a completed upload by its S3 key and returns the stored avatar URL. */
export const confirmAvatarUploadSchema = baseSchema.extend({
  body: z.strictObject({
    key: str(1, 512).regex(
      /^uploads\/users\/[A-Za-z0-9-]+\/profile-image\/[A-Za-z0-9-]+\.[a-z]{3,4}$/,
      "Invalid upload key",
    ),
  }),
})

export type UserSearchRequest = z.infer<typeof userSearchSchema>
export type UserOnboardingRequest = z.infer<typeof userOnboardingSchema>
export type GetUserProfileImagePresignUrlRequest = z.infer<
  typeof getUserProfileImagePresignUrlSchema
>
export type UpdateMyProfileRequest = z.infer<typeof updateMyProfileSchema>
export type ConfirmAvatarUploadRequest = z.infer<typeof confirmAvatarUploadSchema>
