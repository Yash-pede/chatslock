import {WS_EVENT_TYPE} from "@repo/types/schema";
import type {WsContext, WsReply} from "@repo/api/core";
import {connectService, disconnectService} from "./connection.service";

/**
 * `$connect`: store the connection, then greet the client. The authorizer is
 * the only auth gate; a missing `userId` here means an unauthenticated route
 * slipped through API Gateway config, so fail closed with 401.
 *
 * The greeting rides on the handshake response itself — calling
 * `postToConnection` inside `$connect` fails with 410 Gone because API Gateway
 * has not registered the connection until this handler returns.
 */
export const connectController = async (c: WsContext): Promise<WsReply> => {
    if (!c.userId) return c.reply(401);

    await connectService({userId: c.userId, connectionId: c.connectionId});

    return c.reply(200, {type: WS_EVENT_TYPE.connected, connectionId: c.connectionId});
};

/**
 * `$disconnect`: drop the connection row. The socket is closing regardless of
 * what we do, so there is no client to answer — and a 410 from a callback
 * would only add log noise.
 */
export const disconnectController = async (c: WsContext): Promise<WsReply> => {
    if (!c.userId) return c.reply(200);

    await disconnectService({userId: c.userId, connectionId: c.connectionId});

    return c.reply(200);
};
