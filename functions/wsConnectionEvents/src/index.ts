import { WsRouter, type WsContext, type WsReply } from "@repo/api/core"
import { parseOrThrow } from "@repo/api/utils"
import {
  getWsGroup,
  wsFrameSchema,
  WS_EVENT_TYPE,
  WS_MESSAGE_ACTION,
  WS_MESSAGE_OP,
  WS_USER_ACTION,
  WS_USER_OP,
} from "@repo/types/schema"
import { connectController, disconnectController } from "./connection/connection.controller"
import {
  deleteMessageController,
  editMessageController,
  listMessagesController,
  readMessageController,
  sendMessageController,
} from "./message/message.controller"
import { userConversationController } from "./user/user.controller"

const app = new WsRouter()

const validateFrame = async (c: WsContext): Promise<WsReply | void> => {
  const frame = c.req.json<{ action?: string; op?: string }>()
  const { op } = frame

  try {
    const group = getWsGroup(c.routeKey)
    const schema = group ? (op ? group.ops[op] : undefined) : wsFrameSchema
    if (!schema) {
      throw new Error(op ? `Unknown op "${op}" for ${c.routeKey}` : `Missing op for ${c.routeKey}`)
    }

    const parsed = parseOrThrow(schema, frame) as { data?: unknown }
    c.set("valid", parsed.data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid frame"
    console.warn("[ws] frame rejected", {
      connectionId: c.connectionId,
      routeKey: c.routeKey,
      action: frame.action,
      op,
      message,
    })
    await c.push({ type: WS_EVENT_TYPE.error, code: "BAD_REQUEST", message })
    return
  }
}

app.use(validateFrame)

app.route("$connect", connectController)
app.route("$disconnect", disconnectController)

app
  .group(WS_MESSAGE_ACTION)
  .on(WS_MESSAGE_OP.send, sendMessageController)
  .on(WS_MESSAGE_OP.edit, editMessageController)
  .on(WS_MESSAGE_OP.delete, deleteMessageController)
  .on(WS_MESSAGE_OP.list, listMessagesController)
  .on(WS_MESSAGE_OP.read, readMessageController)

app.group(WS_USER_ACTION).on(WS_USER_OP.conversation, userConversationController)

app.route("$default", async (c) => {
  // Anything else (unknown action, or a body without `action`). Answering an
  // error frame keeps the client's round trip observable; log the cause.
  const action = c.req.json<{ action?: string }>().action
  console.warn("[ws] unroutable frame", { connectionId: c.connectionId, action })
  return c.send({
    type: WS_EVENT_TYPE.error,
    message: `Unknown action${action ? ` "${action}"` : ""}`,
  })
})

export const handler = app.handle()
