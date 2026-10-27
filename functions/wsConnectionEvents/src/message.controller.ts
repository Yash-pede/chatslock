import type { WsContext, WsReply } from "@repo/api/core"
import type {
  DeleteMessageData,
  EditMessageData,
  ListMessageData,
  ReadMessageData,
  SendMessageData,
} from "@repo/types/req"
import { ApiException, parseOrThrow } from "@repo/api/utils"
import {
  messageDeletedAckSchema,
  messageEditedAckSchema,
  messageListAckSchema,
  messageSentAckSchema,
  WS_EVENT_TYPE,
  WS_MESSAGE_ACK_TYPE,
  wsErrorAckSchema,
} from "@repo/types/schema"
import {
  deleteMessageService,
  editMessageService,
  listMessagesService,
  readMessageService,
  sendMessageService,
} from "./message.service"

export const readMessageController = async (c: WsContext): Promise<WsReply | void> => {
  const data = c.get<ReadMessageData>("valid")
  if (!c.userId || !data) return c.reply(401)

  try {
    await readMessageService({ userId: c.userId, conversationId: data.conversationId })
  } catch (error) {
    return wsErrorResponse(c, error, data)
  }
}

export const sendMessageController = async (c: WsContext): Promise<WsReply | void> => {
  const data = c.get<SendMessageData>("valid")
  if (!c.userId || !data) return c.reply(401)

  try {
    const message = await sendMessageService({
      senderId: c.userId,
      message: data,
      postToConnection: c.postToConnection,
    })

    // Validate before replying: a bad shape here would throw AFTER the row was
    // written and turn into a 500 the client never sees (the socket was fine,
    // but the sender sees no ack and re-sends).
    const ack = parseOrThrow(messageSentAckSchema, {
      type: WS_MESSAGE_ACK_TYPE.sent,
      message,
      ...clientIdOf(data),
    })
    return toReply(await c.push(ack))
  } catch (error) {
    return wsErrorResponse(c, error, data)
  }
}

export const editMessageController = async (c: WsContext): Promise<WsReply | void> => {
  const data = c.get<EditMessageData>("valid")
  if (!c.userId || !data) return c.reply(401)

  try {
    const message = await editMessageService({
      editorId: c.userId,
      edit: data,
      postToConnection: c.postToConnection,
    })

    return toReply(
      await c.push(
        parseOrThrow(messageEditedAckSchema, {
          type: WS_MESSAGE_ACK_TYPE.edited,
          message,
          ...clientIdOf(data),
        }),
      ),
    )
  } catch (error) {
    return wsErrorResponse(c, error, data)
  }
}

export const deleteMessageController = async (c: WsContext): Promise<WsReply | void> => {
  const data = c.get<DeleteMessageData>("valid")
  if (!c.userId || !data) return c.reply(401)

  try {
    const result = await deleteMessageService({
      deleterId: c.userId,
      target: data,
      postToConnection: c.postToConnection,
    })

    return toReply(
      await c.push(
        parseOrThrow(messageDeletedAckSchema, {
          type: WS_MESSAGE_ACK_TYPE.deleted,
          ...result,
          ...clientIdOf(data),
        }),
      ),
    )
  } catch (error) {
    return wsErrorResponse(c, error, data)
  }
}

export const listMessagesController = async (c: WsContext): Promise<WsReply | void> => {
  const data = c.get<ListMessageData>("valid")
  if (!c.userId || !data) return c.reply(401)

  try {
    const result = await listMessagesService({ userId: c.userId, list: data })
    return toReply(
      await c.push(
        parseOrThrow(messageListAckSchema, {
          type: WS_MESSAGE_ACK_TYPE.list,
          ...result,
          ...clientIdOf(data),
        }),
      ),
    )
  } catch (error) {
    return wsErrorResponse(c, error, data)
  }
}

/** The frame was already pushed; the invocation itself just succeeded. */
const toReply = (_frame: unknown): WsReply => ({ statusCode: 200 })

/** Echoes the frame's `clientId` on the ack under the same name. */
const clientIdOf = (data?: { clientId?: string } | undefined) =>
  data?.clientId ? { clientId: data.clientId } : {}

/**
 * Errors are delivered the same way as acks: pushed to the connection. A
 * `reply` body never reaches the client on a non-`$default` route, so an error
 * returned that way looks exactly like "no response".
 */
const wsErrorResponse = async (
  c: WsContext,
  error: unknown,
  data?: { clientId?: string } | undefined,
): Promise<WsReply> => {
  if (error instanceof ApiException) {
    return toReply(
      await c.push(
        parseOrThrow(wsErrorAckSchema, {
          type: WS_EVENT_TYPE.error,
          code: error.code,
          message: error.message,
          ...clientIdOf(data),
        }),
      ),
    )
  }

  console.error("WS message action failed", error)
  return toReply(
    await c.push(
      parseOrThrow(wsErrorAckSchema, {
        type: WS_EVENT_TYPE.error,
        message: "Internal error. Please try again.",
        ...clientIdOf(data),
      }),
    ),
  )
}
