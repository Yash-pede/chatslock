import {Hono} from 'hono'
import {handle} from '@hono/aws-lambda'
import {HTTPException} from "hono/http-exception";
import {validateWithZod, userOnboardingSchema} from "@repo/api/schema"
import {onboardingController} from "./users.controller"

const app = new Hono({strict: false}).basePath("/api/users")

app.post("/onboarding", validateWithZod(userOnboardingSchema), onboardingController)

app.onError((err, c) => {
    const status = err instanceof HTTPException ? err.status : 500;
    if (!(err instanceof HTTPException)) {
        console.error(err);
    }
    return c.json(
        {
            success: false,
            message: err.message || "Something went wrong.",
        },
        status,
    )
})

export const handler = handle(app)
