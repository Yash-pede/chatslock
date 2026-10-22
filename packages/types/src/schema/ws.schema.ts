/**
 * String constants for the realtime channel, shared by the Lambda and the
 * clients so no layer hardcodes event, ack or op names as literals.
 */
export const WS_MESSAGE_ACTION = "message" as const;
export type WsMessageAction = typeof WS_MESSAGE_ACTION;

export const WS_EVENT_TYPE = {
    connected: "connected",
    error: "error",
} as const;
export type WsEventType = typeof WS_EVENT_TYPE[keyof typeof WS_EVENT_TYPE];

export const WS_MESSAGE_EVENT_TYPE = {
    created: "message.new",
    updated: "message.updated",
    deleted: "message.deleted",
} as const;
export type WsMessageEventName = keyof typeof WS_MESSAGE_EVENT_TYPE;
export type WsMessageEventType = typeof WS_MESSAGE_EVENT_TYPE[WsMessageEventName];

export const WS_MESSAGE_ACK_TYPE = {
    sent: "message.sent",
    edited: "message.edited",
    deleted: "message.deleted",
    list: "message.list",
} as const;
export type WsMessageAckName = keyof typeof WS_MESSAGE_ACK_TYPE;
export type WsMessageAckType = typeof WS_MESSAGE_ACK_TYPE[WsMessageAckName];

export const WS_MESSAGE_OP = {
    send: "send",
    edit: "edit",
    delete: "delete",
    list: "list",
} as const;
export type WsMessageOpName = keyof typeof WS_MESSAGE_OP;
export type WsMessageOp = typeof WS_MESSAGE_OP[WsMessageOpName];
