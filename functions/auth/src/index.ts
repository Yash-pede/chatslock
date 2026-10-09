import {Hono} from 'hono'
import {handle} from '@hono/aws-lambda'
import {loginController, otpController, refreshController, verifyOtpController} from "./auth.controller"
import {initiateOtpSchema, loginSchema, refreshOtpSchema, validateWithZod, verifyOtpSchema} from "@repo/api/schema";
import {HTTPException} from "hono/http-exception";

const app = new Hono()

app.get("/", (c) => {
    c.json({
        message: "Welcome to the Hono!",
    })
})
app.post("/otp/request", validateWithZod(initiateOtpSchema), otpController)
app.post("/otp/verify", validateWithZod(verifyOtpSchema), verifyOtpController)
app.post("/login", validateWithZod(loginSchema), loginController)
app.get("/refresh", validateWithZod(refreshOtpSchema), refreshController)
app.post("/logout")

app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return err.getResponse()
    }
    console.error(err)
    return c.text("Internal Server Error", 500)
})

export const handler = handle(app)
