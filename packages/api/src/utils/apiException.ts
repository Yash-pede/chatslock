import type {ContentfulStatusCode} from "hono/utils/http-status";
import {HTTPException} from "hono/http-exception";

export type ApiError = {
    code: string;
    message: string;
    details?: unknown;
};

export type ApiResponse<T> =
    | { ok: true; data: T }
    | { ok: false; error: ApiError };

const STATUS_CODE: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    500: "INTERNAL_ERROR",
};

export const codeForStatus = (status: number) => STATUS_CODE[status] ?? "ERROR";

/** An HTTPException that also carries a machine-readable code and optional details. */
export class ApiException extends HTTPException {
    readonly code: string;
    readonly details?: unknown;

    constructor(
        status: ContentfulStatusCode,
        {code, message, details}: { code?: string; message: string; details?: unknown },
    ) {
        super(status, {message, cause: details});
        this.code = code ?? codeForStatus(status);
        this.details = details;
    }
}
