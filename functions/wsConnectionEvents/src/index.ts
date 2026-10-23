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

const validateFrame = async (c: WsContext): Promise<WsReply | void> => {
  const { op } = c.req.json<{ op?: string }>()

  try {
    c.set("valid", parseOrThrow(pickSchema(c.routeKey, op), c.req.json()))
  } catch (error) {
    return c.reply(400, {
      type: WS_EVENT_TYPE.error,
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Invalid frame",
    })
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

app.route("$default", async (c) =>
  c.send({ type: WS_EVENT_TYPE.error, message: `Unknown action for route ${c.routeKey}` }),
)

export const handler = app.handle()
