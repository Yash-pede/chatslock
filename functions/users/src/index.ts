import { Hono } from "hono"
import { handle } from "@hono/aws-lambda"
import {
  avatarImagePresignUrlSchema,
  confirmAvatarUploadSchema,
  getPublicProfileReq,
  getUserProfilesReq,
  revokeSessionSchema,
  updateMyProfileSchema,
  updateSessionPushTokenSchema,
  userActiveConversationReq,
  userOnboardingSchema,
} from "@repo/types/req"
import { validateWithZod } from "@repo/api/req"
import {
  confirmAvatarUploadController,
  getAvatarPresignedUrlController,
  getPublicProfileController,
  getPublicProfilesController,
  getUserByIdController,
  getSessionsController,
  onboardingController,
  revokeSessionController,
  updateMyProfileController,
  updateSessionPushTokenController,
  userConversationController,
} from "./users.controller"
import type { ApiGatewayRequestContextV2, LambdaContext, LambdaEvent } from "@hono/aws-lambda"
import { apiErrorHandler, withAuth, withResponse } from "@repo/api/utils"

type Bindings = {
  event: LambdaEvent
  requestContext: ApiGatewayRequestContextV2
  context: LambdaContext
}

const app = new Hono<{ Bindings: Bindings }>({ strict: false }).basePath("/api/users")

app.use(withResponse)
app.use(withAuth)

app.post("/onboarding", validateWithZod(userOnboardingSchema), onboardingController)
app.get("/me", getUserByIdController)
app.get("/profile", validateWithZod(getPublicProfileReq), getPublicProfileController)
app.post("/profiles", validateWithZod(getUserProfilesReq), getPublicProfilesController)

app.post("/avatar", validateWithZod(avatarImagePresignUrlSchema), getAvatarPresignedUrlController)
app.post(
  "/avatar/confirm",
  validateWithZod(confirmAvatarUploadSchema),
  confirmAvatarUploadController,
)
app.patch("/me", validateWithZod(updateMyProfileSchema), updateMyProfileController)
app.post(
  "/sessions",
  validateWithZod(updateSessionPushTokenSchema),
  updateSessionPushTokenController,
)
app.get("/sessions", getSessionsController)
app.delete("/sessions/:id", validateWithZod(revokeSessionSchema), revokeSessionController)
app.post(
  "/conversationMeta",
  validateWithZod(userActiveConversationReq),
  userConversationController,
)
app.onError(apiErrorHandler)

export const handler = handle(app)
