import { Hono } from "hono"
import { handle } from "@hono/aws-lambda"
import {
  adminCreateUserController,
  loginController,
  logOutUserController,
  otpController,
  refreshController,
  verifyOtpController,
} from "./auth.controller"
import { initiateOtpSchema, loginSchema, refreshOtpSchema, verifyOtpSchema } from "@repo/types/req"
import { validateWithZod } from "@repo/api/req"
import { apiErrorHandler, withResponse } from "@repo/api/utils"

const app = new Hono({ strict: false }).basePath("/api/auth")

// Same `{ ok, data }` envelope as the other services, and the shared error
// handler so every failure lands in CloudWatch with method/path/status.
app.use(withResponse)

app.post("/otp/request", validateWithZod(initiateOtpSchema), otpController)
app.post("/otp/verify", validateWithZod(verifyOtpSchema), verifyOtpController)
app.post(
  "/login",
  validateWithZod(loginSchema, {
    onInvalid: {
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "Incorrect username or password.",
    },
  }),
  loginController,
)
app.post("/refresh", validateWithZod(refreshOtpSchema), refreshController)
app.post("/logout", logOutUserController)

// Disable In Prod
app.post("/4dm!n-cr3ate-us3r", adminCreateUserController)

app.onError(apiErrorHandler)

export const handler = handle(app)
