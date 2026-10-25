import { createMiddleware } from "hono/factory"
import type { ZodObject, ZodType } from "zod"
import { ApiException } from "../utils/apiException"

/** Request envelope shared by every route: `{body, query, params}`. */
export type RequestSchema = ZodObject<{
  body: ZodType
  query: ZodType
  params: ZodType
}>

export interface ValidateOptions {
  /**
   * Override the failure for a schema whose validation details must not reach
   * the client (e.g. credentials: telling someone the password shape is wrong
   * leaks information and is worse UX than a single generic message).
   */
  onInvalid?: { status?: 400 | 401 | 403; code?: string; message: string }
}

/**
 * True when the body is JSON, including the SigV4 variants AWS services use
 * (`application/x-amz-json-1.1`, `application/x-amz-json-1.0`). Relying on
 * `c.req.json()` alone would silently treat those bodies as empty.
 */
function isJsonContentType(contentType: string): boolean {
  return /(?:^|\s|,)application\/(?:[\w.+-]*\+)?json(?:;|\s|,|$)/i.test(contentType)
}

/**
 * Parses `{body, query, params}` from the request and puts the result on
 * `c.get("valid")`.
 */
export const validateWithZod = (schema: RequestSchema, options: ValidateOptions = {}) =>
  createMiddleware(async (c, next) => {
    const contentType = c.req.header("content-type") || ""
    let parsedBody: unknown = {}

    if (contentType && isJsonContentType(contentType)) {
      parsedBody = await c.req.json().catch((error: unknown) => {
        console.warn("[api] request body is not valid JSON", {
          method: c.req.method,
          path: c.req.path,
          contentType,
          error,
        })
        return {}
      })
    }

    const result = schema.safeParse({
      body: parsedBody ?? {},
      query: c.req.query() ?? {},
      params: c.req.param() ?? {},
    })

    if (!result.success) {
      if (options.onInvalid) {
        throw new ApiException(options.onInvalid.status ?? 400, {
          code: options.onInvalid.code ?? "VALIDATION_ERROR",
          message: options.onInvalid.message,
        })
      }

      const modifiedIssues = result.error.issues.map((e) => {
        const message =
          e.code === "unrecognized_keys" ? "Unrecognized fields are not allowed" : e.message
        const path = e.path[0] === "body" ? e.path.slice(1) : e.path
        return { ...e, message, path }
      })

      // The schema's own messages (e.g. "Must contain uppercase", "OTP must be
      // 6 digits") are what the client displays, so the first failure becomes
      // the top-level message instead of a generic "Validation failed".
      console.warn("[api] request validation failed", {
        method: c.req.method,
        path: c.req.path,
        contentType,
        issues: modifiedIssues,
      })

      throw new ApiException(400, {
        code: "VALIDATION_ERROR",
        message: modifiedIssues[0]?.message ?? "Validation failed",
      })
    }

    c.set("valid", result.data)
    await next()
  })
