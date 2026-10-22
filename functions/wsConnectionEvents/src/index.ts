import { WsRouter, type WsContext } from "@repo/api/core";
import { connectController, disconnectController } from "./connection.controller";

/**
 * Connection lifecycle + message routes. One Lambda serves every WebSocket
 * route, so add the route key here and point API Gateway at it.
 */
const app = new WsRouter();

// Lifecycle routes have no authorizer context, so they skip the check.
const PUBLIC_ROUTES = new Set(["$connect", "$disconnect"]);

app.use(async (c: WsContext) => {
    if (!c.userId && !PUBLIC_ROUTES.has(c.routeKey)) {
        await c.send({type: "error", message: "Unauthenticated connection"}).catch(() => {});
        return c.reply(401);
    }
    return undefined;
});

app.route("$connect", connectController);
app.route("$disconnect", disconnectController);

app.route("$default", async (c) =>
    c.send({type: "error", message: `Unknown action for route ${c.routeKey}`}),
);

export const handler = app.handle();
