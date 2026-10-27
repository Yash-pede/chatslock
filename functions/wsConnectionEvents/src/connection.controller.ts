import { WS_EVENT_TYPE } from "@repo/types/schema"
import type { WsContext, WsReply } from "@repo/api/core"
import { connectService, disconnectService } from "./connection.service"

/**
 * `$connect`: persist the socket so messages can be pushed to this device, then
 * answer 200 — a 2xx here is what completes the handshake. No frame is sent:
 * the connection is usable as soon as API Gateway upgrades it, and the client
 * treats `open` as connected. The authorizer is the only auth gate; a missing
 * `userId` means an unauthenticated route slipped through the config, so fail
 * closed with 401.
 */
export const connectController = async (c: WsContext): Promise<WsReply> => {
  if (!c.userId) {
    // API Gateway rejects the handshake with this body, which is also how the
    // client learns *why* (the access log only records the status).
    console.error("[ws] $connect without authorizer context", {
      connectionId: c.connectionId,
      authorizer: c.event.requestContext.authorizer,
    })
    return c.reply(401, {
      type: WS_EVENT_TYPE.error,
      code: "UNAUTHORIZED",
      message: "Missing or expired token",
    })
  }

  await connectService({ userId: c.userId, connectionId: c.connectionId })

  // The access log shows this route as `status: 200` with every field "-", so
  // a successful socket is only visible here.
  console.log("[ws] $connect ok", {
    userId: c.userId,
    connectionId: c.connectionId,
    sourceIp: c.event.requestContext.identity?.sourceIp,
  })

  return c.reply(200)
}

/**
 * `$disconnect`: drop the connection row. The socket is closing regardless of
 * what we do, so there is no client to answer — and a 410 from a callback
 * would only add log noise.
 */
export const disconnectController = async (c: WsContext): Promise<WsReply> => {
  if (!c.userId) {
    console.warn("[ws] $disconnect without authorizer context", { connectionId: c.connectionId })
    return c.reply(200)
  }

  await disconnectService({ userId: c.userId, connectionId: c.connectionId })

  console.log("[ws] $disconnect ok", { userId: c.userId, connectionId: c.connectionId })

  return c.reply(200)
}
