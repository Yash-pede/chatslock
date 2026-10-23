import type { Message } from "@repo/types/schema"
import type { ChatMessage } from "./types"

/**
 * Deterministic pseudo-waveform for voice bubbles: the server stores only the
 * duration, so bars are derived from the message id to keep rendering stable
 * across re-renders and reloads.
 */
function waveformFrom(seed: string, bars = 20): number[] {
  return Array.from(
    { length: bars },
    (_, index) => ((seed.charCodeAt(index % seed.length) ?? 0) % 8) + 1,
  )
}

/**
 * Maps a backend message into the bubble shape. Deleted messages keep their
 * slot as a tombstone so the list order stays stable. Image dimensions are not
 * part of the payload yet, so a square preview ratio is assumed.
 */
export function toChatMessage(message: Message, currentUserId: string | null): ChatMessage {
  const base = {
    id: message.messageId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    isMine: message.senderId === currentUserId,
    createdAt: message.createdAt,
  }

  if (message.deletedAt) {
    return { ...base, kind: "text", text: "This message was deleted", isSystem: true }
  }

  switch (message.type) {
    case "IMAGE":
      return {
        ...base,
        kind: "image",
        text: message.body,
        image: {
          url: message.attachment?.thumbnailUrl ?? message.attachment?.url ?? "",
          width: 600,
          height: 600,
        },
      }
    case "AUDIO":
      return {
        ...base,
        kind: "voice",
        voice: {
          durationSeconds: Math.max(1, Math.round((message.attachment?.durationMs ?? 0) / 1000)),
          waveform: waveformFrom(message.messageId),
        },
      }
    case "DOC":
      return {
        ...base,
        kind: "file",
        text: message.body,
        attachment: {
          id: message.messageId,
          fileName: message.attachment?.fileName ?? "document",
          sizeBytes: message.attachment?.sizeBytes ?? 0,
          mimeType: message.attachment?.mimeType ?? "application/octet-stream",
        },
      }
    default:
      return { ...base, kind: "text", text: message.body ?? "" }
  }
}
