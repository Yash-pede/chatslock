import {Hono} from 'hono'
import {handle} from '@hono/aws-lambda'
import {validateWithZod, conversationListSchema} from "@repo/api/schema"
import {conversationsListController} from "./conversations.controller"
import type {ApiGatewayRequestContextV2, LambdaContext, LambdaEvent} from "@hono/aws-lambda"
import {apiErrorHandler, withAuth, withResponse} from "@repo/api/utils";

type Bindings = {
    event: LambdaEvent
    requestContext: ApiGatewayRequestContextV2
    context: LambdaContext
}

const app = new Hono<{ Bindings: Bindings }>({strict: false}).basePath("/api/conversations")

app.use(withResponse)
app.use(withAuth)

app.get("/list", validateWithZod(conversationListSchema), conversationsListController)

app.onError(apiErrorHandler)

export const handler = handle(app)
