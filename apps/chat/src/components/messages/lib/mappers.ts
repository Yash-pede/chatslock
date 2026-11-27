import type { CachedMessage } from "@/db/schema"
import type { ChatMessage } from "../types"

/**
 * Deterministic pseudo-waveform for voice bubbles: the server stores only the
 * duration, so bars are derived from the message uid to keep rendering stable
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
 * Builds the bubble shape straight from the cache row. Deleted messages keep
 * their slot as a tombstone so the list order stays stable. Image dimensions are
 * not part of the payload yet, so a square preview ratio is assumed.
 */
export function cachedRowToChatMessage(
  row: CachedMessage,
  currentUserId: string | null,
): ChatMessage {
  // The row's wire attachment/status/pendingId are replaced below with their
  // presentation shapes, so they are destructured out before the spread.
  const { attachment: wireAttachment, status, pendingId, ...rest } = row
  const base: ChatMessage = {
    ...rest,
    isMine: row.senderId === currentUserId,
    status: (status as ChatMessage["status"] | null) ?? "sent",
    pendingId: pendingId ?? undefined,
  }

  if (row.deletedAt != null) {
    return { ...base, text: "This message was deleted", isDeleted: true }
  }

  // Keep the original attachment (not just the image thumbnail / voice URL) so
  // the selection actions can download the media instead of only previewing it.
  const attachment = wireAttachment
    ? {
        id: row.uid,
        url: wireAttachment.url,
        fileName: wireAttachment.fileName ?? `${row.messageId}`,
        sizeBytes: wireAttachment.sizeBytes,
        mimeType: wireAttachment.mimeType,
      }
    : undefined

  switch (row.type) {
    case "IMAGE":
      return {
        ...base,
        type: "IMAGE",
        text: row.body ?? undefined,
        image: {
          url: wireAttachment?.thumbnailUrl ?? wireAttachment?.url ?? "",
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
          url: wireAttachment?.url ?? "",
          durationSeconds: Math.max(1, Math.round((wireAttachment?.durationMs ?? 0) / 1000)),
          waveform: waveformFrom(row.uid),
        },
        attachment,
      }
    case "DOC": {
      const mimeType = wireAttachment?.mimeType ?? "application/octet-stream"
      const doc: ChatMessage = {
        ...base,
        type: "DOC",
        text: row.body ?? undefined,
        attachment: {
          id: row.uid,
          url: wireAttachment?.url ?? "",
          fileName: wireAttachment?.fileName ?? "document",
          sizeBytes: wireAttachment?.sizeBytes ?? 0,
          mimeType,
        },
      }
      // A video is stored as `DOC` but should render as a playable preview.
      return mimeType.startsWith("video/")
        ? { ...doc, video: { url: wireAttachment?.url ?? "", width: 600, height: 600 } }
        : doc
    }
    default:
      return { ...base, type: "TEXT", text: row.body ?? "" }
  }
}
