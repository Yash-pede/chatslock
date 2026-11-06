import { WsContext } from "@repo/api/core"
import { userActiveConversation } from "@repo/types"
import { userActiveConversationService } from "./user.service"

export const userConversationController = async (c: WsContext) => {
  const data = c.get<userActiveConversation>("valid")
  if (!data || !data.conversationId || !c.userId || !data.status) return c.reply(400)

  await userActiveConversationService({
    userId: c.userId,
    conversationId: data.conversationId,
    status: data.status,
    push: c.push,
  })
}
