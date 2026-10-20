import type {Context} from "hono";
import {userOnboardingSchema} from "@repo/api/schema/requests";
import {getUserById, onboardUser} from "./users.service";

export const onboardingController = async (c: Context) => {
    const {body}: userOnboardingSchema = c.get("valid");

    const resp = await onboardUser({
        userId: c.get("userId"),
        cognitoUsername: c.get("cognitoUsername"),
        username: body.username,
        fullName: body.fullName,
        agentId: body.agentId,
    })

    return c.json(resp);
}

export const getUserByIdController = async (c: Context) => {
    const resp = await getUserById({userId: c.get("userId")});

    return c.json(resp);
}