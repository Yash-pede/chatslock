import type { Message } from "@repo/types/schema"
import type { CachedMessage } from "@/db/schema"
import type { ChatMessage } from "../types"

/**
 * Deterministic pseudo-waveform for voice bubbles: the server stores only the
 * duration, so bars are derived from the message id to keep rendering stable
 * across re-renders and reloads.
 */
export function waveformFrom(seed: string, bars = 24): number[] {
  return Array.from({ length: bars }, (_, index) => {
    const code = seed.charCodeAt(index % seed.length) || 0
    // Keep bars in 0.25..1 so none look flat.
    return 0.25 + ((code % 8) / 8) * 0.75
  })
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

  if (message.deletedAt != null) {
    return {
      ...base,
      type: "TEXT",
      text: "This message was deleted",
      isDeleted: true,
    }
  }

  // Keep the original attachment (not just the image thumbnail / voice URL) so
  // the selection actions can download the media instead of only previewing it.
  const attachment = message.attachment
    ? {
        id: message.messageId,
        url: message.attachment.url,
        fileName: message.attachment.fileName ?? `${message.messageId}`,
        sizeBytes: message.attachment.sizeBytes,
        mimeType: message.attachment.mimeType,
      }
    : undefined

  switch (message.type) {
    case "IMAGE":
      return {
        ...base,
        type: "IMAGE",
        text: message.body,
        image: {
          url: message.attachment?.thumbnailUrl ?? message.attachment?.url ?? "",
          width: 600,
          height: 600,
        },
        attachment,
      }
    case "AUDIO":
      return {
        ...base,
        type: "AUDIO",
        voice: {
          url: message.attachment?.url ?? "",
          durationSeconds: Math.max(1, Math.round((message.attachment?.durationMs ?? 0) / 1000)),
          waveform: waveformFrom(message.messageId),
        },
        attachment,
      }
    case "DOC": {
      const mimeType = message.attachment?.mimeType ?? "application/octet-stream"
      const doc = {
        ...base,
        type: "DOC" as const,
        text: message.body,
        attachment: {
          id: message.messageId,
          url: message.attachment?.url ?? "",
          fileName: message.attachment?.fileName ?? "document",
          sizeBytes: message.attachment?.sizeBytes ?? 0,
          mimeType,
        },
      }
      // A video is stored as `DOC` but should render as a playable preview.
      return mimeType.startsWith("video/")
        ? { ...doc, video: { url: message.attachment?.url ?? "", width: 600, height: 600 } }
        : doc
    }
    default:
      return { ...base, type: "TEXT", text: message.body ?? "" }
  }
}

/**
 * Rebuilds the wire-shaped message from a cache row. Local-only columns
 * (`pendingId`, `status`) are intentionally dropped.
 */
export function messageFromRow(row: CachedMessage): Message {
  return {
    messageId: row.messageId,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    ...(row.body !== null ? { body: row.body } : {}),
    ...(row.attachment !== null ? { attachment: row.attachment } : {}),
    createdAt: row.createdAt,
    ...(row.editedAt !== null ? { editedAt: row.editedAt } : {}),
    ...(row.deletedAt !== null ? { deletedAt: row.deletedAt } : {}),
  }
}

/** A cached row in bubble shape, including its local send status. */
export function cachedRowToChatMessage(
  row: CachedMessage,
  currentUserId: string | null,
): ChatMessage {
  return {
    ...toChatMessage(messageFromRow(row), currentUserId),
    status: (row.status as ChatMessage["status"] | null) ?? "sent",
    ...(row.pendingId ? { pendingId: row.pendingId } : {}),
  }
}
