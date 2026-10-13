import {Hono} from 'hono'
import {handle} from '@hono/aws-lambda'
import {validateWithZod, userOnboardingSchema} from "@repo/api/schema"
import {onboardingController} from "./users.controller"
import type {ApiGatewayRequestContextV2, LambdaContext, LambdaEvent} from "@hono/aws-lambda"
import {apiErrorHandler, withAuth, withResponse} from "@repo/api/utils";

type Bindings = {
    event: LambdaEvent
    requestContext: ApiGatewayRequestContextV2
    context: LambdaContext
}

const app = new Hono<{ Bindings: Bindings }>({strict: false}).basePath("/api/users")

app.use(withResponse)
app.use(withAuth)

app.post("/onboarding", validateWithZod(userOnboardingSchema), onboardingController)

app.onError(apiErrorHandler)

export const handler = handle(app)
