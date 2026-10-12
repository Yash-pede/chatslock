export const ROLE_NAMES = ["user", "agent", "moderator", "admin"] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

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