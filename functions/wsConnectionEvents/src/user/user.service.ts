import { Push } from "@repo/api/core"
import { conversationsDao, usersDao } from "@repo/api/dao"
import { parseOrThrow } from "@repo/api/utils"
import {
  ClientConversationStatus,
  getPeerUserId,
  UserId,
  userPeerStatusEventSchema,
  userStatus,
  WS_USER_ACK_TYPE,
} from "@repo/types"

export const userActiveConversationService = async ({
  userId,
  conversationId,
  status,
  push,
}: {
  userId: UserId
  conversationId: string
  status: ClientConversationStatus
  push: Push
}) => {
  switch (status) {
    case "OPENED":
      return Promise.allSettled([
        conversationsDao.setUserActiveConversation({
          userId,
          conversationId,
        }),
        push(
          parseOrThrow(userPeerStatusEventSchema, {
            type: WS_USER_ACK_TYPE.peerStatus,
            status:
              (
                await usersDao.getUserConnections({
                  userId: getPeerUserId(conversationId, userId)!,
                })
              ).length > 0
                ? userStatus.ONLINE
                : userStatus.OFFLINE,
          }),
        ),
      ])
    case "CLOSED":
      return conversationsDao.deleteUserActiveConversation({
        userId,
      })
  }
}
