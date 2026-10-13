import type {Context} from "hono";
import {userOnboardingSchema} from "@repo/api/schema";
import {usersDao} from "./users.dao";
import {onboardUser} from "./users.service";

export const onboardingController = async (c: Context) => {
    const {body}: userOnboardingSchema = c.get("valid");
    const userId = c.get("userId");

    const resp = await onboardUser({
        username: body.username,
        fullName: body.fullName,
        cognitoUsername: userId
    })

    return c.json(resp);
}