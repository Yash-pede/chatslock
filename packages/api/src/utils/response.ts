import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { ApiException, codeForStatus, type ApiError, type ApiResponse } from "./apiException"

export type { ApiError, ApiResponse } from "./apiException"
export { ApiException, codeForStatus } from "./apiException"

/**
 * Writes a JSON envelope without going through `c.json`.
 *
 * `c.json` refuses to answer when the *request* carries a non-JSON content
 * type (it treats it as a `Response` the app already returned). Requests from
 * another AWS service authenticated with SigV4 — the custom-auth Lambda calling
 * Cognito, or any internal caller using an AWS SDK — send
 * `application/x-amz-json-1.1`, and every such response came back as a 400
 * "Invalid HTTP header" instead of the endpoint's real answer.
 */
export function jsonResponse(
  c: Context,
  body: ApiResponse<unknown>,
  status: ContentfulStatusCode = 200,
): Response {
  return c.newResponse(JSON.stringify(body), status, {
    "Content-Type": "application/json",
  })
}

/**
 * Wraps every successful `c.json(body)` as `{ ok: true, data: body }`.
 * Register before your routes. Errors are handled by `apiErrorHandler`, which
 * bypasses this wrapper and emits `{ ok: false, error }`.
 *
 * The envelope is written with `jsonResponse` rather than `c.json`, so success
 * responses work for AWS-service callers too (see `jsonResponse`).
 */
export const withResponse = createMiddleware(async (c, next) => {
  const json = c.json.bind(c)

  c.json = ((
    body: unknown,
    status?: ContentfulStatusCode,
    headers?: Record<string, string | string[]>,
  ) =>
    headers
      ? json({ ok: true, data: body }, status, headers)
      : jsonResponse(c, { ok: true, data: body }, status ?? 200)) as typeof c.json

  await next()
})

/** Hono `onError` handler emitting the standard error envelope. */
export const apiErrorHandler = (err: Error, c: Context): Response => {
  const status: ContentfulStatusCode = err instanceof HTTPException ? err.status : 500
  const isServerError = status >= 500
  const code = err instanceof ApiException ? err.code : codeForStatus(status)

  // Every failure is logged for CloudWatch, including 4xx: without this a
  // rejected request leaves no trace of why the client got an error.
  const detail = {
    method: c.req.method,
    path: c.req.path,
    status,
    code,
    message: err.message,
    name: err.name,
  }

  if (isServerError) {
    console.error("[api] request failed", detail, err)
  } else {
    console.warn("[api] request rejected", detail)
  }

  const error: ApiError = {
    code,
    message: isServerError ? "Something went wrong." : err.message,
  }

  if (err instanceof ApiException && err.details !== undefined) {
    error.details = err.details
  }

  return jsonResponse(c, { ok: false, error } satisfies ApiResponse<never>, status)
}
