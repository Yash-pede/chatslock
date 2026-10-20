import {createMiddleware} from "hono/factory";
import type {ApiGatewayRequestContextV2} from "@hono/aws-lambda";
import {HTTPException} from "hono/http-exception";

export type AuthClaims = Record<string, string | number | boolean | string[]>;

export type LambdaEnv = {
    Bindings: { requestContext: ApiGatewayRequestContextV2 };
    Variables: { userId: string; cognitoUsername: string; claims: AuthClaims };
};

import {ROLE_NAMES, type RoleName} from "../schema/roles";

export {ROLE_NAMES, type RoleName};

export const PERMISSIONS = [
    {key: "message:send", description: "Send messages"},
    {key: "message:read", description: "Read messages"},
    {key: "message:edit", description: "Edit own messages"},
    {key: "message:delete", description: "Delete messages"},
    {key: "conversation:create", description: "Create conversations"},
    {key: "conversation:close", description: "Close conversations"},
    {key: "conversation:add_member", description: "Add member to conversation"},
    {key: "conversation:remove_member", description: "Remove member from conversation"},
    {key: "user:block", description: "Block another user"},
    {key: "user:ban", description: "Ban a user"},
    {key: "user:unban", description: "Unban a user"},
    {key: "report:review", description: "Review reported content"},
    {key: "support:assign", description: "Assign support conversations"},
    {key: "support:respond", description: "Respond to support conversation"},
] as const;

export type PermissionName = (typeof PERMISSIONS)[number]["key"];

export const ROLE_PERMISSION_MAP: Record<RoleName, readonly PermissionName[]> = {
    user: ["message:send", "message:read", "conversation:create", "user:block"],

    agent: [
        "message:send",
        "message:read",
        "user:block",
        "support:respond",
        "conversation:create",
    ],

    moderator: [
        "message:send",
        "message:read",
        "message:delete",
        "conversation:close",
        "conversation:add_member",
        "conversation:remove_member",
        "user:block",
        "user:ban",
        "user:unban",
        "report:review",
    ],

    admin: PERMISSIONS.map((p) => p.key),
};

export function checkPermission(
    role: RoleName,
    permission: PermissionName,
): boolean {
    return ROLE_PERMISSION_MAP[role].includes(permission);
}

export const withAuth = createMiddleware<LambdaEnv>(async (c, next) => {
    const claims = c.env.requestContext?.authorizer?.jwt?.claims;

    const userId = claims?.sub;
    if (typeof userId !== "string") throw new HTTPException(401, {message: "Unauthorized"});

    const cognitoUsername = claims?.username;

    c.set("userId", userId);
    c.set("cognitoUsername", typeof cognitoUsername === "string" ? cognitoUsername : "");
    await next();
});