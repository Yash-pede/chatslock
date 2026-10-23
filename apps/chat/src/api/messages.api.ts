import { useMemo } from "react"
import type {
  ConversationId,
  Message,
  MessageAck,
  MessageAttachment,
  MessageId,
  MessageType,
  WsEventType,
  WsMessageAckType,
} from "@repo/types/schema"
import { WS_MESSAGE_ACTION, WS_MESSAGE_EVENT_TYPE, WS_MESSAGE_OP } from "@repo/types/schema"
import { useWs, type WsSendInput } from "@/context/WebSocketContext"

export type SendMessageInput = {
  conversationId: ConversationId
  type: MessageType
  body?: string
  attachment?: MessageAttachment
}

export type EditMessageInput = {
  conversationId: ConversationId
  messageId: MessageId
  body: string
}

export type DeleteMessageInput = {
  conversationId: ConversationId
  messageId: MessageId
}

export type ListMessagesInput = {
  conversationId: ConversationId
  /** ULID of the last message from the previous page; pages strictly older messages. */
  cursor?: MessageId
  limit?: number
}

export type ReadMessagesInput = {
  conversationId: ConversationId
}

export interface MessagesApi {
  send: (data: SendMessageInput) => boolean
  edit: (data: EditMessageInput) => boolean
  remove: (data: DeleteMessageInput) => boolean
  list: (data: ListMessagesInput) => boolean
  read: (data: ReadMessagesInput) => boolean
}

/** Builds typed frame senders over the socket's raw `send`. */
export function createMessagesApi(send: (input: WsSendInput) => boolean): MessagesApi {
  return {
    send: (data) => send({ action: WS_MESSAGE_ACTION, op: WS_MESSAGE_OP.send, data }),
    edit: (data) => send({ action: WS_MESSAGE_ACTION, op: WS_MESSAGE_OP.edit, data }),
    remove: (data) => send({ action: WS_MESSAGE_ACTION, op: WS_MESSAGE_OP.delete, data }),
    list: (data) => send({ action: WS_MESSAGE_ACTION, op: WS_MESSAGE_OP.list, data }),
    read: (data) => send({ action: WS_MESSAGE_ACTION, op: WS_MESSAGE_OP.read, data }),
  }
}

/**
 * Typed access to the message WS API. `api.*` performs the frame actions; the
 * `on*` helpers subscribe to acks (`message.sent` etc.) and peer events
 * (`message.new` etc.), unwrapping the payload before invoking the handler.
 */
export function useMessagesApi() {
  const { send, on } = useWs()
  const api = useMemo(() => createMessagesApi(send), [send])

  const onAck = (type: WsMessageAckType | WsEventType, handler: (ack: MessageAck) => void) =>
    on(type, handler as (payload: unknown) => void)

  const onMessageCreated = (handler: (message: Message) => void) =>
    on(WS_MESSAGE_EVENT_TYPE.created, (payload) =>
      handler((payload as { message: Message }).message),
    )

  const onMessageUpdated = (handler: (message: Message) => void) =>
    on(WS_MESSAGE_EVENT_TYPE.updated, (payload) =>
      handler((payload as { message: Message }).message),
    )

  const onMessageDeleted = (
    handler: (event: { messageId: string; conversationId: string; deletedAt: number }) => void,
  ) =>
    on(WS_MESSAGE_EVENT_TYPE.deleted, (payload) =>
      handler(payload as { messageId: string; conversationId: string; deletedAt: number }),
    )

  return { api, onAck, onMessageCreated, onMessageUpdated, onMessageDeleted }
}
