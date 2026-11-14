import { useCallback, useMemo } from "react"
import type { Message } from "@repo/types/schema"
import {
  MESSAGE_EVENT,
  messageCreatedEventSchema,
  messageDeletedAckSchema,
  messageEditedAckSchema,
  messageTypingEventSchema,
  messageUpdatedEventSchema,
  type DeleteMessageData,
  type EditMessageData,
  type MessagePublishPayload,
  type MessageTypingData,
  type SendMessageData,
  type TypingStatus,
} from "@repo/types/req"
import { conversationsApi, type MessagePage } from "@/api/conversations.api"
import { useRealtime } from "@/context/RealtimeContext"
import { conversationChannel } from "@/lib/realtime"

/**
 * Request types are the shared `@repo/types/req` schemas. `conversationId`
 * selects the channel and is stripped from the publish payload, so the wire
 * data matches the Lambda's schema exactly.
 */
export type SendMessageInput = SendMessageData & { conversationId: string }
export type EditMessageInput = EditMessageData & { conversationId: string }
export type DeleteMessageInput = DeleteMessageData & { conversationId: string }
export type ListMessagesInput = {
  conversationId: string
  cursor?: string
  limit?: number
}

export type { MessagePage }

export interface MessageEventHandlers {
  onCreated: (message: Message, clientId?: string) => void
  onUpdated: (message: Message) => void
  onDeleted: (event: { messageId: string; conversationId: string }) => void
  onTyping: (event: MessageTypingData) => void
}

/**
 * Message realtime API for one conversation. Publishes go to the conversation
 * channel and the resulting event comes back through the same subscription, so
 * the sender's optimistic row is replaced exactly like the peer's.
 */
export function useMessagesApi(conversationId: string, currentUserId: string | null) {
  const { publish, subscribe } = useRealtime()
  const channel = conversationChannel(conversationId)

  const api = useMemo(() => {
    const publishMessage = (payload: MessagePublishPayload) => publish(channel, payload)

    return {
      send: (input: SendMessageInput) => {
        const data: SendMessageData = {
          type: input.type,
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.attachment ? { attachment: input.attachment } : {}),
          ...(input.clientId ? { clientId: input.clientId } : {}),
        }
        return publishMessage({ eventType: MESSAGE_EVENT.send, data })
      },

      edit: (input: EditMessageInput) => {
        const data: EditMessageData = {
          messageId: input.messageId,
          body: input.body,
          ...(input.clientId ? { clientId: input.clientId } : {}),
        }
        return publishMessage({ eventType: MESSAGE_EVENT.edit, data })
      },

      remove: (input: DeleteMessageInput) => {
        const data: DeleteMessageData = {
          messageId: input.messageId,
          ...(input.clientId ? { clientId: input.clientId } : {}),
        }
        return publishMessage({ eventType: MESSAGE_EVENT.delete, data })
      },

      /** Ephemeral typing state, published on the same conversation channel. */
      typing: (status: TypingStatus) => {
        if (!currentUserId) return Promise.resolve()
        return publishMessage({
          eventType: MESSAGE_EVENT.typing,
          data: { userId: currentUserId, status },
        })
      },

      /** History is HTTP now; only live traffic stays on the channel. */
      list: (input: ListMessagesInput): Promise<MessagePage> => conversationsApi.getMessages(input),
    }
  }, [publish, channel, currentUserId])

  /**
   * One channel subscription that fans out by `eventType` instead of three
   * listeners on the same channel.
   */
  const subscribeToMessages = useCallback(
    (handlers: MessageEventHandlers) =>
      subscribe(channel, (event) => {
        const typing = messageTypingEventSchema.safeParse(event)
        if (typing.success) {
          handlers.onTyping(typing.data.data)
          return
        }

        const created = messageCreatedEventSchema.safeParse(event)
        if (created.success) {
          handlers.onCreated(created.data.data.message, created.data.data.clientId)
          return
        }

        const updated = messageUpdatedEventSchema.safeParse(event)
        if (updated.success) {
          handlers.onUpdated(updated.data.data.message)
          return
        }

        const edited = messageEditedAckSchema.safeParse(event)
        if (edited.success) {
          handlers.onUpdated(edited.data.data.message)
          return
        }

        const deleted = messageDeletedAckSchema.safeParse(event)
        if (deleted.success) handlers.onDeleted(deleted.data.data)
      }),
    [subscribe, channel],
  )

  return { api, subscribeToMessages }
}
