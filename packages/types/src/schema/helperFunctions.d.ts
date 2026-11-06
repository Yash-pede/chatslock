/**
 * Conversation ids are composite `TYPE#<u1>#<u2>` (the user ids are sorted), so
 * the peer is whichever id after the type segment is not the caller. Keys with
 * fewer than two user ids have no peer to resolve.
 */
export declare function getPeerUserId(
  conversationId: string,
  currentUserId: string | null,
): string | null
//# sourceMappingURL=helperFunctions.d.ts.map
