import {z} from "zod";
import {baseSchema} from "./base";
import {AUTH_CLIENTS} from "../schema/auth.schema";

const phonePipe = z.string()
    .trim()
    .transform((val) => val.replace(/\s+/g, "").replace(/^(\+91|0)/, ""))
    .refine((val) => /^[6-9]\d{9}$/.test(val), "Invalid phone number")
    .transform((val) => `+91${val}`);

const usernamePipe = z.string().min(1, "Username is required").toLowerCase();

export const loginSchema = baseSchema.extend({
    body: z.strictObject({
        username: usernamePipe,
        password: z.string()
            .min(8, "Password must be at least 8 characters")
            .regex(/[A-Z]/, "Must contain uppercase")
            .regex(/[a-z]/, "Must contain lowercase")
            .regex(/\d/, "Must contain number")
            .regex(/[^A-Za-z\d]/, "Must contain special character"),
    }),
});

export const verifyOtpSchema = baseSchema.extend({
    body: z.strictObject({
        otp: z.string().length(6, "OTP must be 6 digits"),
        username: usernamePipe,
        session: z.string().min(20, "Session is required and must be valid"),
    }),
});

export const initiateOtpSchema = baseSchema.extend({
    body: z.strictObject({
        phone: phonePipe,
        role: z.literal("user", {
            error: "Only users can initiate OTP",
        }),
    }),
});

export const refreshOtpSchema = baseSchema.extend({
    body: z.strictObject({
        refreshToken: z.string(),
        client: z.enum(AUTH_CLIENTS).optional().default("otp"),
    }),
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type VerifyOtpRequest = z.infer<typeof verifyOtpSchema>;
export type InitiateOtpRequest = z.infer<typeof initiateOtpSchema>;
export type RefreshOtpRequest = z.infer<typeof refreshOtpSchema>;
