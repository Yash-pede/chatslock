import { WsRouter, type WsContext, type WsReply } from "@repo/api/core"
import { parseOrThrow } from "@repo/api/utils"
import { MESSAGES_OP_SCHEMAS, wsFrameSchema, type MessagesWsOp } from "@repo/types/req"
import { WS_EVENT_TYPE } from "@repo/types/schema"
import { connectController, disconnectController } from "./connection.controller"
import {
  deleteMessageController,
  editMessageController,
  listMessagesController,
  readMessageController,
  sendMessageController,
} from "./message.controller"

const app = new WsRouter()

const pickSchema = (routeKey: string, op?: string) => {
  if (routeKey !== "message" || !op) return wsFrameSchema
  return MESSAGES_OP_SCHEMAS[op as MessagesWsOp] ?? wsFrameSchema
}

/**
 * Validates the frame and stores the **parsed data** under `valid`, which is
 * what controllers read (`c.get<SendMessageData>("valid")`). Storing the whole
 * envelope here is what made every `conversationId` undefined downstream.
 */
const validateFrame = async (c: WsContext): Promise<WsReply | void> => {
  const frame = c.req.json<{ action?: string; op?: string }>()
  const { op } = frame

  try {
    const parsed = parseOrThrow(pickSchema(c.routeKey, op), frame) as { data?: unknown }
    c.set("valid", parsed.data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid frame"
    // Without this the 400 only exists in the access log, where every error
    // field is "-": a rejected frame would look like a healthy invocation.
    console.warn("[ws] frame rejected", {
      connectionId: c.connectionId,
      routeKey: c.routeKey,
      action: frame.action,
      op,
      message,
    })
    // Pushed, not replied: a reply body never reaches the client on a
    // non-`$default` route, so a rejected frame looked like silence.
    await c.push({ type: WS_EVENT_TYPE.error, code: "BAD_REQUEST", message })
    return
  }
}

app.use(validateFrame)

app.route("$connect", connectController)
app.route("$disconnect", disconnectController)

app
  .group("message")
  .on("send", sendMessageController)
  .on("edit", editMessageController)
  .on("delete", deleteMessageController)
  .on("list", listMessagesController)
  .on("read", readMessageController)

/**
 * Heartbeat (`{"action":"system"}`) is answered by API Gateway's MOCK
 * integration, not here: the Lambda has no route for it, and a mocked reply
 * cannot 5xx or cost an invocation.
 */

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
