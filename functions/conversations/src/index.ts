import { Hono } from "hono"
import { handle } from "@hono/aws-lambda"
import type { ApiGatewayRequestContextV2, LambdaContext, LambdaEvent } from "@hono/aws-lambda"
import { apiErrorHandler, withAuth, withResponse } from "@repo/api/utils"
import {
  confirmAvatarUploadSchema,
  getChatPageConversationSchema,
  getConversationMessagesSchema,
  getConversationProfilesSchema,
  mediaUploadPresignUrlSchema,
} from "@repo/types/req"
import { validateWithZod } from "@repo/api/req"
import {
  chatPageConversationsController,
  conversationMessagesController,
  conversationProfilesController,
  getMediaUploadPresignedUrlController,
} from "./conversatinos.controller"

type Bindings = {
  event: LambdaEvent
  requestContext: ApiGatewayRequestContextV2
  context: LambdaContext
}

const app = new Hono<{ Bindings: Bindings }>({ strict: false }).basePath("/api/conversations")

app.use(withResponse)
app.use(withAuth)

app.get("/chat", validateWithZod(getChatPageConversationSchema), chatPageConversationsController)

app.post(
  "/profiles",
  validateWithZod(getConversationProfilesSchema),
  conversationProfilesController,
)

app.post(
  "/messages",
  validateWithZod(getConversationMessagesSchema),
  conversationMessagesController,
)
app.post(
  "/media",
  validateWithZod(mediaUploadPresignUrlSchema),
  getMediaUploadPresignedUrlController,
)

app.onError(apiErrorHandler)

export const handler = handle(app)
