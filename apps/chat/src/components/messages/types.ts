import type { CachedMessage } from "@/db/schema"

/**
 * Message shapes used by the conversation screen. Media messages carry the
 * dimensions so the list can reserve the right space before the image loads,
 * which is what keeps scrolling from jumping.
 */
export interface MessageImage {
  url: string
  width: number
  height: number
}

/** A video message (stored as `DOC` on the wire, surfaced as a playable preview). */
export interface MessageVideo {
  url: string
  width: number
  height: number
}

export interface MessageAttachment {
  id: string
  url: string
  fileName: string
  sizeBytes: number
  mimeType: string
}

/** Local send state of an outgoing message. */
export type ChatMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed"

/**
 * A chat row is the drizzle cache row plus the presentation-only fields the
 * bubbles need. Every storage field (`uid`, `messageId`, `peerId`, `version`,
 * `isForwarded`, `replyTo`, `pinned`, `deletedAt`, …) comes straight from the
 * `messages` table, so the two can never drift apart.
 */
export type ChatMessage = Omit<CachedMessage, "attachment" | "status" | "pendingId"> & {
  /** True when the signed-in user sent it. */
  isMine: boolean
  /** Display text; tombstones get "This message was deleted". */
  text?: string
  image?: MessageImage
  video?: MessageVideo
  /** The wire attachment reshaped for previews and the downloader. */
  attachment?: MessageAttachment
  voice?: { url: string; durationSeconds: number; waveform: number[] }
  status?: ChatMessageStatus
  /**
   * `clientId` of the request that created this optimistic row. The server
   * echoes it on the ack, so the real message can be matched exactly instead of
   * guessing by text.
   */
  pendingId?: string
  /** System notices (date chips, "X joined") render centered without a bubble. */
  isSystem?: boolean
  /** Tombstone for a message whose body/attachment was removed by the server. */
  isDeleted?: boolean
}

/** A locally picked file ready to be uploaded and attached to a media message. */
export interface PickedMedia {
  uri: string
  fileName: string
  mimeType: string
  sizeBytes: number
  /** Pixel dimensions when the picker knows them (images/videos); avoids reflow. */
  width?: number
  height?: number
}
