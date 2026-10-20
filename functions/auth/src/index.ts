import {Hono} from 'hono'
import {handle} from '@hono/aws-lambda'
import {
    adminCreateUserController,
    loginController,
    logOutUserController,
    otpController,
    refreshController,
    verifyOtpController
} from "./auth.controller"
import {initiateOtpSchema, loginSchema, refreshOtpSchema, validateWithZod, verifyOtpSchema} from "@repo/api/schema/requests";
import {HTTPException} from "hono/http-exception";

const app = new Hono({strict: false}).basePath("/api/auth")

app.post("/otp/request", validateWithZod(initiateOtpSchema), otpController)
app.post("/otp/verify", validateWithZod(verifyOtpSchema), verifyOtpController)
app.post("/login", validateWithZod(loginSchema), loginController)
app.post("/refresh", validateWithZod(refreshOtpSchema), refreshController)
app.post("/logout", logOutUserController)

// Disable In Prod
app.post("/4dm!n-cr3ate-us3r",adminCreateUserController)

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
