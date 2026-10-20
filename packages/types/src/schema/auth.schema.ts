/**
 * Sign-in flow that produced a session. Refresh tokens are bound to the Cognito
 * app client that issued them, so a session's flow decides which client /refresh
 * must use: `otp` -> users client, `userpass` -> admin client.
 */
export const AUTH_CLIENTS = ["otp", "userpass"] as const;

export type AuthClient = typeof AUTH_CLIENTS[number];
