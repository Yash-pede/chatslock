import type {
  AppSyncEventsPublishEvent,
  AppSyncEventsSubscribeEvent,
} from "@aws-lambda-powertools/event-handler/types"

/**
 * Cognito identity AppSync forwards on every event. `AppSyncEventsPublishEvent`
 * declares `identity` as `Record<string, unknown> | null` because the shape
 * depends on the auth type, so the Cognito fields are narrowed here once
 * instead of re-declaring the whole event.
 */
export const identityOf = (event: AppSyncEventsPublishEvent | AppSyncEventsSubscribeEvent) => {
  const identity = event.identity as {
    sub?: string
    username?: string
    groups?: string[]
    claims?: {
      sub?: string
      username?: string
      "cognito:groups"?: string[]
    }
  } | null

  const userId = identity?.claims?.sub ?? identity?.sub
  if (!userId) {
    throw new Error("AppSync event is missing a Cognito identity")
  }

  return {
    userId,
    username: identity?.claims?.username ?? identity?.username ?? userId,
    groups: identity?.claims?.["cognito:groups"] ?? identity?.groups ?? [],
  }
}
