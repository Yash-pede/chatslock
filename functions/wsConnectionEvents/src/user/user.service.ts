import { conversationsDao } from "@repo/api/dao"
import { ClientConversationStatus, UserId } from "@repo/types"

export const userActiveConversationService = async ({
  userId,
  conversationId,
  status,
}: {
  userId: UserId
  conversationId: string
  status: ClientConversationStatus
}) => {
  switch (status) {
    case "OPENED":
      return conversationsDao.setUserActiveConversation({
        userId,
        conversationId,
      })
    case "CLOSED":
      return conversationsDao.deleteUserActiveConversation({
        userId,
      })
  }
}
