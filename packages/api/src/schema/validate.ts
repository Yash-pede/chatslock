import {createMiddleware} from 'hono/factory'
import {prettifyError, ZodError, ZodObject, ZodType} from "zod";

export type Schema = ZodObject<{
    body: ZodType<any>;
    query: ZodType<any>;
    params: ZodType<any>;
}>;

export const validateWithZod = (schema: Schema) => createMiddleware(async (c, next) => {
    const contentType = c.req.header('content-type') || ''
    let parsedBody = {}

    if (contentType.includes('application/json')) {
        parsedBody = await c.req.json().catch(() => ({}))
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

        const errors = new ZodError(modifiedIssues);

        return c.json({
            message: "Validation failed",
            errors: prettifyError(errors),
        }, 400);
    }
    c.set('valid', result.data)
    await next()
})