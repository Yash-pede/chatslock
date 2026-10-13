import type {Context} from "hono";
import type {ContentfulStatusCode} from "hono/utils/http-status";
import {createMiddleware} from "hono/factory";
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

const codeForStatus = (status: number) => STATUS_CODE[status] ?? "ERROR";

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

/**
 * Wraps every successful `c.json(body)` as `{ ok: true, data: body }`.
 * Register before your routes. Errors are handled by `apiErrorHandler`, which
 * bypasses this wrapper and emits `{ ok: false, error }`.
 */
export const withResponse = createMiddleware(async (c, next) => {
    const json = c.json.bind(c);

    c.json = ((
        body: unknown,
        status?: ContentfulStatusCode,
        headers?: Record<string, string | string[]>,
    ) => json({ok: true, data: body}, status, headers)) as typeof c.json;

    await next();
});

/** Hono `onError` handler emitting the standard error envelope. */
export const apiErrorHandler = (err: Error, c: Context): Response => {
    const status: ContentfulStatusCode = err instanceof HTTPException ? err.status : 500;
    const isServerError = status >= 500;

    if (isServerError) console.error(err);

    const error: ApiError = {
        code: err instanceof ApiException ? err.code : codeForStatus(status),
        message: isServerError ? "Something went wrong." : err.message,
    };

    if (err instanceof ApiException && err.details !== undefined) {
        error.details = err.details;
    }

    return c.newResponse(JSON.stringify({ok: false, error} satisfies ApiResponse<never>), status, {
        "Content-Type": "application/json",
    });
};
