import type { Message } from "@repo/types/schema"
import type { ChatMessage } from "./types"

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

  if (message.deletedAt) {
    return { ...base, type: "TEXT", text: "This message was deleted", isSystem: true }
  }

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
 * Merges new messages into the list, de-duplicating by id and ordering by ULID
 * (the key the server pages by). Optimistic rows have no ULID yet, so they sort
 * last until the server echoes them back.
 */
export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const item of [...existing, ...incoming]) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => compareIds(a.id, b.id))
}

function compareIds(a: string, b: string): number {
  const aOptimistic = a.startsWith("optimistic-")
  const bOptimistic = b.startsWith("optimistic-")
  if (aOptimistic || bOptimistic) {
    if (aOptimistic && bOptimistic) return Number(a.split("-")[1]) - Number(b.split("-")[1])
    return aOptimistic ? 1 : -1
  }
  return a < b ? -1 : a > b ? 1 : 0
}
