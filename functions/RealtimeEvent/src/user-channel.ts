import { UnauthorizedException } from "@aws-lambda-powertools/event-handler/appsync-events"
import { conversationsDao } from "@repo/api/dao"
import { userId as userIdSchema, type UserId } from "@repo/types/schema"

const USER_NAMESPACE = "user"

/** `/user/<uuid>` -> the channel owner's id (leading slash optional). */
export const userIdFromChannel = (path: string): UserId => {
  const segments = path.startsWith("/") ? path.slice(1).split("/") : path.split("/")

  if (segments[0] !== USER_NAMESPACE || segments.length !== 2 || !segments[1]) {
    throw new UnauthorizedException("Invalid user channel")
  }

  const parsed = userIdSchema.safeParse(segments[1])
  if (!parsed.success) {
    throw new UnauthorizedException("Invalid user id")
  }

  return parsed.data
}

/** Presence is self-reported, so a client may only publish to its own channel. */
export const assertOwnUserChannel = (channelUserId: UserId, userId: UserId): void => {
  if (channelUserId !== userId) {
    throw new UnauthorizedException("You can only publish your own user status")
  }
}

/**
 * A user may subscribe to their own channel or to someone they have a DIRECT
 * conversation with; presence is not visible to unrelated accounts.
 */
export const assertCanSubscribeToUser = async (
  channelUserId: UserId,
  userId: UserId,
): Promise<void> => {
  if (channelUserId === userId) return

  const connected = await conversationsDao.hasDirectConversationWith({
    userId,
    otherUserId: channelUserId,
  })
  if (!connected) {
    throw new UnauthorizedException("You are not connected to this user")
  }
}
