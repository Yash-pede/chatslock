import type { AppSyncEventsPublishEvent } from "@aws-lambda-powertools/event-handler/types"
import { parseOrThrow } from "@repo/api/utils"
import {
  MESSAGE_ACK_EVENT_TYPE,
  messageCreatedEventSchema,
  messageDeletedAckSchema,
  messageEditedAckSchema,
  type DeleteMessageReq,
  type EditMessageReq,
  type SendMessageReq,
} from "@repo/types/req"
import { identityOf } from "../identity"
import {
  deleteMessageService,
  editMessageService,
  sendMessageService,
} from "./message.service"

const clientIdOf = (data: { clientId?: string }) =>
  data.clientId ? { clientId: data.clientId } : {}

export const sendMessageController = async (
  data: SendMessageReq,
  event: AppSyncEventsPublishEvent,
) => {
  const { userId } = identityOf(event)

  const message = await sendMessageService({ senderId: userId, message: data })

  return parseOrThrow(messageCreatedEventSchema, {
    eventType: MESSAGE_ACK_EVENT_TYPE.new,
    data: { message, ...clientIdOf(data) },
  })
}

export const editMessageController = async (
  edit: EditMessageReq,
  event: AppSyncEventsPublishEvent,
) => {
  const { userId } = identityOf(event)

  const message = await editMessageService({ editorId: userId, edit })

  return parseOrThrow(messageEditedAckSchema, {
    eventType: MESSAGE_ACK_EVENT_TYPE.edited,
    data: { message, ...clientIdOf(edit) },
  })
}

export const deleteMessageController = async (
  target: DeleteMessageReq,
  event: AppSyncEventsPublishEvent,
) => {
  const { userId } = identityOf(event)

  const result = await deleteMessageService({ deleterId: userId, target })

  return parseOrThrow(messageDeletedAckSchema, {
    eventType: MESSAGE_ACK_EVENT_TYPE.deleted,
    data: { ...result, ...clientIdOf(target) },
  })
}

/** Read receipts have no payload; returning nothing also skips the broadcast. */
