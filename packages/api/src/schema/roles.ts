export const ROLE_NAMES = ["user", "agent", "moderator", "admin"] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
