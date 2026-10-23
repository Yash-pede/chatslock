import z from "zod"
import { fullName, userId, username } from "./user.schema"

export const TABLE_NAME = "chat"

/**
 * The public slice of a user that other participants may see. This is the only
 * shape conversations return for peers: no phone, role, cognito username or keys.
 */
export const conversationUserProfileSchema = z.object({
  userId,
  username,
  fullName,
  avatar: z.url().optional(),
})

/** A peer profile as returned by `POST /api/conversations/profiles`. */
export type ConversationUserProfile = z.infer<typeof conversationUserProfileSchema>
