import type { MessageType } from "@repo/types/schema"

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

export interface ChatMessage {
  id: string
  conversationId: string
  /** `u1#u2`-style conversation id is the key; this is who wrote the message. */
  senderId: string
  /** True when the signed-in user sent it. */
  isMine: boolean
  type: MessageType
  text?: string
  image?: MessageImage
  video?: MessageVideo
  attachment?: MessageAttachment
  voice?: { url: string; durationSeconds: number; waveform: number[] }
  /** Epoch milliseconds. */
  createdAt: number
  status?: "sending" | "sent" | "delivered" | "read" | "failed"
  /**
   * `clientId` of the request that created this optimistic row. The server
   * echoes it on the ack, so the real message can be matched exactly instead of
   * guessing by text.
   */
  pendingId?: string
  /** System notices (date chips, "X joined") render centered without a bubble. */
  isSystem?: boolean
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
