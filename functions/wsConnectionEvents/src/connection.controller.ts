import type {WsContext, WsReply} from "@repo/api/core";
import {connectService, disconnectService} from "./connection.service";

/** `$connect`: store the connection, then greet the client. */
export const connectController = async (c: WsContext): Promise<WsReply> => {
    if (!c.userId) return c.reply(401);

    await connectService({userId: c.userId, connectionId: c.connectionId});

    return c.send({type: "connected", connectionId: c.connectionId});
};

/** `$disconnect`: drop the connection row. API Gateway closes the socket anyway. */
export const disconnectController = async (c: WsContext): Promise<WsReply> => {
    if (!c.userId) return c.reply(200);

    await disconnectService({userId: c.userId, connectionId: c.connectionId});

    return c.reply(200);
};
