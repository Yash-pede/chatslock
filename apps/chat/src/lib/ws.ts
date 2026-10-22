/**
 * Realtime endpoint config. `EXPO_PUBLIC_WSAPI_URL` is the API Gateway
 * WebSocket URL that the `ws-connections` Lambda serves; it is normalized to
 * `wss://` here because the same env value is also used to build HTTPS
 * callback URLs on the backend.
 */
const WS_BASE_URL = (process.env.EXPO_PUBLIC_WSAPI_URL?.trim() || "")
    .replace(/^http/, "ws");

export const wsConnectUrl = (accessToken: string): string =>
    `${WS_BASE_URL}?token=${encodeURIComponent(accessToken)}`;
