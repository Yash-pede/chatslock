import { MetricUnit } from "@aws-lambda-powertools/metrics"
import {
  AppSyncEventsResolver,
  UnauthorizedException,
} from "@aws-lambda-powertools/event-handler/appsync-events"
import type {
  AppSyncEventsPublishEvent,
  AppSyncEventsSubscribeEvent,
} from "@aws-lambda-powertools/event-handler/types"
import { AWSManager } from "@repo/api/utils"
import {
  messagePublishEnvelopeSchema,
  MESSAGE_EVENT,
  userPublishEnvelopeSchema,
} from "@repo/types/req"
import type { ConversationId, UserId } from "@repo/types/schema"
import type { Context } from "aws-lambda"
import type { z } from "zod"
import { assertConversationMember, conversationIdFromChannel } from "./conversation"
import { identityOf } from "./identity"
import { assertCanSubscribeToUser, assertOwnUserChannel, userIdFromChannel } from "./user-channel"
import {
  deleteMessageController,
  editMessageController,
  readMessageController,
  sendMessageController,
} from "./message/message.controller"

const { logger, metrics, tracer } = AWSManager

type PublishHandler = (payload: unknown, event: AppSyncEventsPublishEvent) => Promise<unknown>

/**
 * Validates without Zod's serialized JSON message: AppSync returns the thrown
 * error's message to the publisher verbatim, so it must stay short.
 */
const parsePayload = <S extends z.ZodType>(schema: S, input: unknown): z.output<S> => {
  const result = schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join(".") || "payload"
    throw new Error(`${path}: ${issue?.message ?? "invalid value"}`)
  }
  return result.data
}

type RealtimeEvent = AppSyncEventsPublishEvent | AppSyncEventsSubscribeEvent

/**
 * Resolves the channel's conversation and verifies the caller is a member.
 * Rejections are logged with the raw channel so a denial is visible in
 * CloudWatch instead of only surfacing as `UnauthorizedException` to the client.
 */
const authorizeConversation = async (
  event: RealtimeEvent,
  operation: "publish" | "subscribe",
): Promise<{ conversationId: ConversationId; userId: UserId }> => {
  const channel = event.info.channel.path

  try {
    const { userId } = identityOf(event)
    const conversationId = conversationIdFromChannel(channel)
    await assertConversationMember(conversationId, userId)
    return { conversationId, userId }
  } catch (error) {
    logger.error(`Realtime ${operation} denied`, { channel, operation, error })
    tracer.addErrorAsMetadata(error as Error)
    throw error
  }
}

const app = new AppSyncEventsResolver()

const handleConversationPublish: PublishHandler = async (payload, event) => {
  const { conversationId, userId } = await authorizeConversation(event, "publish")

  const message = parsePayload(messagePublishEnvelopeSchema, payload)
  const { eventType } = message

  const subsegment = tracer.getSegment()?.addNewSubsegment(`## ${eventType}`)
  tracer.putAnnotation("operation", eventType)
  metrics.addDimension("operation", eventType)
  metrics.addMetric("RealtimeRequests", MetricUnit.Count, 1)

  try {
    switch (message.eventType) {
      case MESSAGE_EVENT.send:
        return await sendMessageController({ conversationId, ...message.data }, event)
      case MESSAGE_EVENT.edit:
        return await editMessageController({ conversationId, ...message.data }, event)
      case MESSAGE_EVENT.delete:
        return await deleteMessageController({ conversationId, ...message.data }, event)
      case MESSAGE_EVENT.read:
        return await readMessageController({ conversationId, ...message.data }, event)
      case MESSAGE_EVENT.typing:
        // Ephemeral: validate the caller owns the id, then let AppSync broadcast.
        if (message.data.userId !== userId) {
          throw new UnauthorizedException("Typing userId must match the caller")
        }
        return message
    }
  } catch (error) {
    logger.error(`${eventType} failed`, { error })
    tracer.addErrorAsMetadata(error as Error)
    throw error
  }
}

app.onPublish("/conversation/*", handleConversationPublish)

app.onSubscribe("/conversation/*", async (event) => {
  const { conversationId } = await authorizeConversation(event, "subscribe")

  const namespace = event.info.channelNamespace.name

  // The full channel path has unbounded cardinality, so it is a log field, not
  // a metric dimension; the namespace is the bounded dimension.
  metrics.addDimension("channelNamespace", namespace)
  metrics.addMetric("Connections", MetricUnit.Count, 1)
  logger.info("Subscription created", { conversationId, channelNamespace: namespace })
})

app.onPublish("/user/*", async (payload, event) => {
  const channel = event.info.channel.path

  try {
    const { userId } = identityOf(event)
    const channelUserId = userIdFromChannel(channel)
    assertOwnUserChannel(channelUserId, userId)

    const message = parsePayload(userPublishEnvelopeSchema, payload)
    logger.info("User status published", { userId, userStatus: message.data.userStatus })
    return message
  } catch (error) {
    logger.error("User status publish denied", { channel, error })
    tracer.addErrorAsMetadata(error as Error)
    throw error
  }
})

app.onSubscribe("/user/*", async (event) => {
  const channel = event.info.channel.path

  try {
    const { userId } = identityOf(event)
    const channelUserId = userIdFromChannel(channel)
    await assertCanSubscribeToUser(channelUserId, userId)
    logger.info("User channel subscribed", { userId, channelUserId })
  } catch (error) {
    logger.error("User channel subscribe denied", { channel, error })
    tracer.addErrorAsMetadata(error as Error)
    throw error
  }
})

export const handler = async (event: unknown, context: Context) => {
  logger.addContext(context)
  logger.logEventIfEnabled(event)

  // Annotations make the channel filterable in X-Ray without logging the payload.
  const channel = (event as { info?: { channel?: { path?: string } } })?.info?.channel?.path
  if (channel) tracer.putAnnotation("channel", channel)

  const subsegment = tracer.getSegment()?.addNewSubsegment("## pub/sub")

  try {
    return await app.resolve(event, context)
  } catch (error) {
    metrics.addMetric("RealtimeErrors", MetricUnit.Count, 1)
    logger.error("Realtime event failed", { error, channel })
    tracer.addErrorAsMetadata(error as Error)
    throw error
  } finally {
    subsegment?.close()
    AWSManager.flushMetrics()
  }
}
