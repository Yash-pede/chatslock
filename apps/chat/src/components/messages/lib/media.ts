import type { ChatMessage } from "../types"

/** A photo or video that can be opened in the full-screen viewer. */
export interface MediaItem {
  id: string
  kind: "image" | "video"
  url: string
  width: number
  height: number
}

/** Extracts the openable media from a message, or `null` if it has none. */
export function mediaItemOf(message: ChatMessage): MediaItem | null {
  if (message.isSystem) return null
  if (message.image) {
    return {
      id: message.id,
      kind: "image",
      url: message.image.url,
      width: message.image.width,
      height: message.image.height,
    }
  }
  if (message.video) {
    return {
      id: message.id,
      kind: "video",
      url: message.video.url,
      width: message.video.width,
      height: message.video.height,
    }
  }
  return null
}

/**
 * The media of the messages currently loaded in the screen, in conversation
 * order. Only loaded messages are included — older pages are not fetched for
 * the viewer.
 */
export function collectMedia(messages: ChatMessage[]): MediaItem[] {
  return messages.map(mediaItemOf).filter((item): item is MediaItem => item !== null)
}
