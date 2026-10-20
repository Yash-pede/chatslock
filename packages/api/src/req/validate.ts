import {createMiddleware} from "hono/factory";
import {flattenError, ZodError, type ZodObject, type ZodType} from "zod";
import {ApiException} from "../utils/apiException";

/** Request envelope shared by every route: `{body, query, params}`. */
export type RequestSchema = ZodObject<{
    body: ZodType;
    query: ZodType;
    params: ZodType;
}>;

/** Parses `{body, query, params}` from the request and puts the result on `c.get("valid")`. */
export const validateWithZod = (schema: RequestSchema) => createMiddleware(async (c, next) => {
    const contentType = c.req.header('content-type') || '';
    let parsedBody = {};

    if (contentType.includes('application/json')) {
        parsedBody = await c.req.json().catch(() => ({}));
    }

    const result = schema.safeParse({
        body: parsedBody ?? {},
        query: c.req.query() ?? {},
        params: c.req.param() ?? {},
    });

    if (!result.success) {
        const modifiedIssues = result.error.issues.map((e) => {
            const message = e.code === "unrecognized_keys"
                ? "Unrecognized fields are not allowed"
                : e.message;
            const path = e.path[0] === "body" ? e.path.slice(1) : e.path;
            return {...e, message, path};
        });

        throw new ApiException(400, {
            code: "VALIDATION_ERROR",
            message: "Validation failed",
            details: flattenError(new ZodError(modifiedIssues)),
        });
    }

    c.set('valid', result.data);
    await next();
});
