import type { Message } from "./message.schema"

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

/**
 * Structural membership rule for composite conversation ids: a DIRECT id embeds
 * both participant ids, so the caller must be one of them. Non-DIRECT ids and
 * ids without two participants cannot be decided structurally — the caller is
 * allowed here and the storage-backed membership check decides on the server.
 */
export function isDirectConversationParticipant(conversationId: string, userId: string): boolean {
  const [type, ...ids] = conversationId.split("#")
  if (type !== "DIRECT" || ids.length < 2) return true
  return ids.includes(userId)
}

/** Chat-list label for media messages; shared by pushes and preview builders. */
export const MEDIA_PREVIEW_LABEL = {
  IMAGE: "Sent a photo",
  AUDIO: "Sent a voice message",
  DOC: "Sent a document",
} as const

/** Preview truncation: append `...` only when the text exceeds 30 characters. */
export function truncatePreview(text: string): string {
  return text.length > 30 ? `${text.slice(0, 30)}...` : text
}

/** Chat-list preview for a stored message (same format on client and server). */
export function messagePreview(message: Pick<Message, "type" | "body" | "deletedAt">): string {
  if (message.deletedAt != null) return "Message deleted"

  const text =
    message.type === "TEXT" ? (message.body ?? "New message") : MEDIA_PREVIEW_LABEL[message.type]
  return truncatePreview(text)
}
