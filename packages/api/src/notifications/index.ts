import Expo, { type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk"
import type { Message } from "@repo/types/schema"

/** Optional; only needed when Expo push security is enabled. */
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN })

export interface PushNotificationContent {
  title: string
  body: string
  /** Android rich notification image. The raw URL is also in `data`. */
  imageUrl?: string
  data?: Record<string, unknown>
}

/**
 * Sends one notification to every valid Expo token.
 *
 * Invalid tokens are dropped and delivery errors are logged instead of thrown:
 * a failed push must never fail the action that produced it.
 */
export const sendPushNotification = async ({
  tokens,
  title,
  body,
  imageUrl,
  data,
}: PushNotificationContent & { tokens: string[] }): Promise<void> => {
  const validTokens = [...new Set(tokens)].filter((token) => Expo.isExpoPushToken(token))
  if (validTokens.length === 0) return

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    sound: "default",
    channelId: "default",
    title,
    body,
    ...(data ? { data } : {}),
    ...(imageUrl ? { richContent: { image: imageUrl } } : {}),
  }))

  try {
    for (const chunk of expo.chunkPushNotifications(messages)) {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk)

      for (const ticket of tickets) {
        if (ticket.status === "error") {
          console.warn("[push] ticket rejected", {
            message: ticket.message,
            error: ticket.details?.error,
            token: ticket.details?.expoPushToken,
          })
        }
      }
    }
  } catch (error) {
    console.error("[push] failed to send notification", error)
  }
}

const MEDIA_BODY = {
  IMAGE: "Sent a photo",
  AUDIO: "Sent a voice message",
  DOC: "Sent a document",
} as const

/**
 * Push content for a stored message. The sender's username is the title; text
 * messages use the body, media messages use a short label and, for images, the
 * attachment URL as rich content.
 */
export const messagePushNotification = (
  message: Message,
  senderName: string,
): PushNotificationContent => {
  const data: Record<string, unknown> = {
    conversationId: message.conversationId,
    messageId: message.messageId,
    messageType: message.type,
  }
  if (message.attachment) data.attachmentUrl = message.attachment.url

  if (message.type === "TEXT") {
    return { title: senderName, body: message.body ?? "New message", data }
  }

  return {
    title: senderName,
    body: MEDIA_BODY[message.type],
    ...(message.type === "IMAGE" && message.attachment
      ? { imageUrl: message.attachment.url }
      : {}),
    data,
  }
}
