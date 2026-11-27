import {
  compositeConversationIdPattern,
  isDirectConversationParticipant,
  type ConversationId,
  type ConversationType,
  type UserId,
} from "@repo/types/schema"
import { ApiException } from "./apiException"

/**
 * The API-facing conversation id: `TYPE#id` (e.g. `DIRECT#u1#u2`). One value
 * carries both the type and the storage id, so callers never pass the type
 * separately.
 */
export const buildConversationId = (type: ConversationType, conversationId: string): string =>
  `${type}#${conversationId}`

/** Inverse of `buildConversationId`; throws when the id is malformed. */
export const parseConversationId = (
  id: string,
): { type: ConversationType; conversationId: string } => {
  if (!compositeConversationIdPattern.test(id)) {
    throw new Error(`Cannot parse conversation id "${id}"`)
  }

  const separator = id.indexOf("#")
  const type = id.slice(0, separator)
  const conversationId = id.slice(separator + 1)

  return { type: type as ConversationType, conversationId }
}

/** Splits `TYPE#id`; a malformed id is a client error, not a denial. */
export const conversationRef = (conversationId: ConversationId) => {
  try {
    return parseConversationId(conversationId)
  } catch {
    throw new ApiException(422, { message: `Invalid conversation id "${conversationId}"` })
  }
}

/**
 * Confirms the caller is a participant of the conversation, or throws 403. A
 * malformed id is a client error (422) before any membership decision is made.
 */
export const assertConversationMember = (conversationId: ConversationId, userId: UserId): void => {
  const message = "You are not a participant of this conversation"

  conversationRef(conversationId)

  if (!isDirectConversationParticipant(conversationId, userId)) {
    throw new ApiException(403, { message })
  }
}
