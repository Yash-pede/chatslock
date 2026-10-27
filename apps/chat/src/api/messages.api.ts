import { useMemo } from "react"
import type { Message, MessageListAck } from "@repo/types/schema"
import type {
  DeleteMessageData,
  EditMessageData,
  ListMessageData,
  ReadMessageData,
  SendMessageData,
} from "@repo/types/req"
import {
  WS_EVENT_TYPE,
  WS_MESSAGE_ACK_TYPE,
  WS_MESSAGE_ACTION,
  WS_MESSAGE_EVENT_TYPE,
  WS_MESSAGE_OP,
} from "@repo/types/schema"
import { useWs } from "@/context/WebSocketContext"

/**
 * The wire types are the schema's own (`@repo/types/req`), shared with the
 * Lambda — this module only narrows what the app may omit. `clientId` is left
 * to the transport (`useWs().request`), except for `send` where the caller
 * supplies it to match its optimistic row.
 */
export type SendMessageInput = SendMessageData
export type EditMessageInput = EditMessageData
export type DeleteMessageInput = DeleteMessageData
/** `limit` defaults server-side, so the app may omit it. */
export type ListMessagesInput = Omit<ListMessageData, "limit"> & { limit?: number }
export type ReadMessagesInput = ReadMessageData

interface Reply {
  clientId?: string
  message?: Message
  messages?: Message[]
  nextCursor?: string
}

const REPLY_TIMEOUT_MS = 10_000

/** Reply types a request of each kind may receive (success + error). */
const REPLY_TYPES: Record<string, string[]> = {
  [WS_MESSAGE_OP.send]: [WS_MESSAGE_ACK_TYPE.sent, WS_EVENT_TYPE.error],
  [WS_MESSAGE_OP.edit]: [WS_MESSAGE_ACK_TYPE.edited, WS_EVENT_TYPE.error],
  [WS_MESSAGE_OP.delete]: [WS_MESSAGE_ACK_TYPE.deleted, WS_EVENT_TYPE.error],
  [WS_MESSAGE_OP.list]: [WS_MESSAGE_ACK_TYPE.list, WS_EVENT_TYPE.error],
  [WS_MESSAGE_OP.read]: [WS_EVENT_TYPE.error],
}

/** Turns a correlated reply into the value the caller expects. */
function parseReply<T>(op: string, reply: Reply): T {
  if (op === WS_MESSAGE_OP.list) {
    return { messages: reply.messages ?? [], nextCursor: reply.nextCursor } as T
  }
  if (op === WS_MESSAGE_OP.read) return undefined as T
  if (!reply.message) throw new Error(`${op} reply had no message`)
  return reply.message as T
}

/**
 * Typed message API over the socket. Each call returns a promise that resolves
 * from the reply echoing its own `clientId`, so concurrent requests never see
 * each other's results. `subscribe` is for unsolicited peer events.
 */
export function useMessagesApi() {
  const { request, on, isOpen } = useWs()

  const api = useMemo(() => {
    const sendFrame = <T>(op: string, data: Record<string, unknown>): Promise<T> => {
      // Fail fast while the socket is down: waiting `REPLY_TIMEOUT_MS` only
      // delays the caller's REST fallback (history, optimistic sends).
      if (!isOpen()) return Promise.reject(new Error("socket not open"))
      return request<T>(
        { action: WS_MESSAGE_ACTION, op, data },
        { types: REPLY_TYPES[op] ?? [WS_EVENT_TYPE.error], timeoutMs: REPLY_TIMEOUT_MS },
      ).then((reply) => parseReply<T>(op, reply as unknown as Reply))
    }

    return {
      send: (input: SendMessageInput) => sendFrame<Message>(WS_MESSAGE_OP.send, { ...input }),
      edit: (input: EditMessageInput) => sendFrame<Message>(WS_MESSAGE_OP.edit, { ...input }),
      remove: (input: DeleteMessageInput) => sendFrame<void>(WS_MESSAGE_OP.delete, { ...input }),
      list: (input: ListMessagesInput) =>
        sendFrame<Pick<MessageListAck, "messages" | "nextCursor">>(WS_MESSAGE_OP.list, {
          ...input,
        }),
      read: (input: ReadMessagesInput) => sendFrame<void>(WS_MESSAGE_OP.read, { ...input }),
    }
  }, [isOpen, request])

  const onMessageCreated = (handler: (message: Message) => void) =>
    on(WS_MESSAGE_EVENT_TYPE.created, (frame) => handler((frame as { message: Message }).message))

  const onMessageUpdated = (handler: (message: Message) => void) =>
    on(WS_MESSAGE_EVENT_TYPE.updated, (frame) => handler((frame as { message: Message }).message))

  const onMessageDeleted = (
    handler: (event: { messageId: string; conversationId: string; deletedAt: number }) => void,
  ) => on(WS_MESSAGE_EVENT_TYPE.deleted, (frame) => handler(frame as never))

  return { api, onMessageCreated, onMessageUpdated, onMessageDeleted }
}
