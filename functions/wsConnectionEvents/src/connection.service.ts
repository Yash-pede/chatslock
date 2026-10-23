import { usersDao } from "@repo/api/dao"

/**
 * Persists the socket so messages can be pushed to this user later. One row per
 * connection: the same user may be online on several devices.
 */
export const connectService = async ({
  userId,
  connectionId,
}: {
  userId: string
  connectionId: string
}): Promise<void> => {
  await usersDao.createUserConnection({ userId, connectionId })
}

/**
 * Removes the socket row. Safe to call for a connection that was never stored
 * (e.g. `$connect` failed), which is why it is not conditional.
 */
export const disconnectService = async ({
  userId,
  connectionId,
}: {
  userId: string
  connectionId: string
}): Promise<void> => {
  await usersDao.deleteUserConnection({ userId, connectionId })
}

/** Open connection ids for a user, used to fan a message out to every device. */
export const userConnectionsService = async ({
  userId,
}: {
  userId: string
}): Promise<{ connectionIds: string[] }> => {
  const connectionIds = await usersDao.getUserConnections({ userId })

  return { connectionIds }
}
