import {Hono} from 'hono'
import {handle} from '@hono/aws-lambda'
import {
    avatarImagePresignUrlSchema,
    confirmAvatarUploadSchema,
    updateMyProfileSchema,
    userOnboardingSchema,
} from "@repo/types/req"
import {validateWithZod} from "@repo/api/req"
import {
    confirmAvatarUploadController,
    getAvatarPresignedUrlController,
    getUserByIdController,
    onboardingController,
    updateMyProfileController,
} from "./users.controller"
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
app.get("/me", getUserByIdController)
app.post("/avatar", validateWithZod(avatarImagePresignUrlSchema), getAvatarPresignedUrlController)
app.post("/avatar/confirm", validateWithZod(confirmAvatarUploadSchema), confirmAvatarUploadController)
app.patch("/me", validateWithZod(updateMyProfileSchema), updateMyProfileController)

app.onError(apiErrorHandler)

export const handler = handle(app)
