import { UnauthorizedException } from "@aws-lambda-powertools/event-handler/appsync-events"
import { conversationsDao } from "@repo/api/dao"
import { parseConversationId } from "@repo/api/utils"
import { compositeConversationId, type ConversationId, type UserId } from "@repo/types/schema"

const CHANNEL_NAMESPACE = "conversation"

/**
 * AppSync channel segments cannot contain `#`, so the composite id is spread
 * over segments: `DIRECT#u1#u2` is published/subscribed as
 * `/conversation/DIRECT/u1/u2`. They are joined back here and validated, so the
 * rest of the Lambda only ever sees the composite id.
 */
export const conversationIdFromChannel = (path: string): ConversationId => {
  // AppSync documents the path with a leading slash; tolerate both forms so a
  // client/library difference cannot turn every valid channel into a denial.
  const segments = path.startsWith("/") ? path.slice(1).split("/") : path.split("/")

  // `/conversation/<type>/<id...>`; empty segments are rejected instead of being
  // filtered away so `conversation//x` or a missing id can never be normalized
  // into a valid channel.
  if (segments[0] !== CHANNEL_NAMESPACE || segments.length < 3) {
    throw new UnauthorizedException("Invalid conversation channel")
  }

  const idSegments = segments.slice(1)
  if (idSegments.some((segment) => segment.length === 0)) {
    throw new UnauthorizedException("Invalid conversation channel")
  }

  const parsed = compositeConversationId.safeParse(idSegments.join("#"))
  if (!parsed.success) {
    throw new UnauthorizedException("Invalid conversation id")
  }

  return parsed.data
}

/**
 * Authorizes subscribe and publish against the caller's membership row. This
 * rejects fabricated ids, conversations that do not exist, and conversations
 * the caller is not part of (not only for DIRECT ids). The cheap structural
 * DIRECT check runs first so an outsider never causes a storage read.
 */
export const assertConversationMember = async (
  conversationId: ConversationId,
  userId: UserId,
): Promise<void> => {
  const { type, conversationId: storageId } = parseConversationId(conversationId)

  if (type === "DIRECT" && !storageId.split("#").includes(userId)) {
    throw new UnauthorizedException("You are not a participant of this conversation")
  }

  const member = await conversationsDao.getUserConversationMember({ userId, conversationId })
  if (!member) {
    throw new UnauthorizedException("You are not a participant of this conversation")
  }
}
