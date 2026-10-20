import {Hono} from 'hono'
import {handle} from '@hono/aws-lambda'
import type {ApiGatewayRequestContextV2, LambdaContext, LambdaEvent} from "@hono/aws-lambda"
import {apiErrorHandler, withAuth, withResponse} from "@repo/api/utils";
import {getChatPageConversationSchema} from "@repo/types/req"
import {validateWithZod} from "@repo/api/req"
import {chatPageConversationsController} from "./conversatinos.controller";


type Bindings = {
    event: LambdaEvent
    requestContext: ApiGatewayRequestContextV2
    context: LambdaContext
}

const app = new Hono<{ Bindings: Bindings }>({strict: false}).basePath("/api/conversations")

app.use(withResponse)
app.use(withAuth)

app.get("/chat", validateWithZod(getChatPageConversationSchema), chatPageConversationsController)

app.onError(apiErrorHandler)

export const handler = handle(app)
