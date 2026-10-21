/**
 * Message shapes used by the conversation screen. Media messages carry the
 * dimensions so the list can reserve the right space before the image loads,
 * which is what keeps scrolling from jumping.
 */
export interface MessageImage {
    url: string;
    width: number;
    height: number;
}

export interface MessageAttachment {
    id: string;
    fileName: string;
    sizeBytes: number;
    mimeType: string;
}

export interface ChatMessage {
    id: string;
    conversationId: string;
    /** `u1#u2`-style conversation id is the key; this is who wrote the message. */
    senderId: string;
    /** True when the signed-in user sent it. */
    isMine: boolean;
    kind: "text" | "image" | "file" | "voice";
    text?: string;
    image?: MessageImage;
    attachment?: MessageAttachment;
    voice?: { durationSeconds: number; waveform: number[] };
    /** Epoch milliseconds. */
    createdAt: number;
    status?: "sending" | "sent" | "delivered" | "read" | "failed";
    /** System notices (date chips, "X joined") render centered without a bubble. */
    isSystem?: boolean;
}
