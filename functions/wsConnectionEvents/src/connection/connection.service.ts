import { conversationsDao, usersDao } from "@repo/api/dao"

export const connectService = async ({
  userId,
  connectionId,
}: {
  userId: string
  connectionId: string
}): Promise<void> => {
  await usersDao.createUserConnection({ userId, connectionId })
}

export const disconnectService = async ({
  userId,
  connectionId,
}: {
  userId: string
  connectionId: string
}) => {
  await Promise.allSettled([
    usersDao.deleteUserConnection({ userId, connectionId }),
    usersDao.updateUser({ userId, lastActiveAt: Date.now() }),
    conversationsDao.deleteUserActiveConversation({ userId }),
  ])
}
