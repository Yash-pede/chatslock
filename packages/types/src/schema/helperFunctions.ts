/**
 * Conversation ids are composite `TYPE#<u1>#<u2>` (the user ids are sorted), so
 * the peer is whichever id after the type segment is not the caller. Keys with
 * fewer than two user ids have no peer to resolve.
 */
export function getPeerUserId(conversationId: string, currentUserId: string | null): string | null {
  const ids = conversationId.split("#").filter(Boolean).slice(1)
  if (ids.length < 2) return null

  const others = ids.filter((id) => id !== currentUserId)
  return others[0] ?? null
}
