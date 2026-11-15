import z from "zod"
import { userId } from "../schema/user.schema"
import { baseSchema } from "./base"
import { MAX_PROFILE_LOOKUP } from "./conversations.req"

export const PEER_USER_STATUS = ["ONLINE", "OFFLINE"] as const
export type PeerUserStatus = (typeof PEER_USER_STATUS)[number]

/** Client → server presence event on `/user/<userId>`; the handler broadcasts it. */
export const USER_EVENT = {
  status: "user.status",
} as const
export type UserEvent = (typeof USER_EVENT)[keyof typeof USER_EVENT]

export const userStatusData = z.strictObject({
  userStatus: z.enum(PEER_USER_STATUS),
})

export const userPublishEnvelopeSchema = z.discriminatedUnion("eventType", [
  z.strictObject({ eventType: z.literal(USER_EVENT.status), data: userStatusData }),
])
export type UserPublishPayload = z.infer<typeof userPublishEnvelopeSchema>

/** `GET /api/users/profile?username=…` — one public profile. */
export const getPublicProfileReq = baseSchema.extend({
  query: z.strictObject({
    username: z.string().min(3).max(20),
  }),
})
export type GetPublicProfileRequest = z.infer<typeof getPublicProfileReq>

/** `POST /api/users/profiles` — public profiles for a page of peer ids. */
export const getUserProfilesReq = baseSchema.extend({
  body: z.strictObject({
    userIds: z
      .array(userId)
      .min(1, "At least one userId is required")
      .max(MAX_PROFILE_LOOKUP, `At most ${MAX_PROFILE_LOOKUP} userIds are allowed`)
      .refine((ids) => new Set(ids).size === ids.length, "userIds must be unique"),
  }),
})
export type GetUserProfilesRequest = z.infer<typeof getUserProfilesReq>
