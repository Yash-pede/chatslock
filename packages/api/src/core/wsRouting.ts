import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi"

export interface WsRequestContext {
  routeKey: string
  eventType: string
  connectionId: string
  messageId?: string
  requestTimeEpoch?: number
  requestId?: string
  domainName: string
  stage: string
  apiId: string
  authorizer?: {
    principalId?: string
    userId?: string
    clientId?: string
    [key: string]: unknown
  }
}

export interface WsEvent {
  requestContext: WsRequestContext
  body?: string | null
  queryStringParameters?: Record<string, string> | null
  headers?: Record<string, string> | null
  isBase64Encoded?: boolean
}

export interface WsReply {
  statusCode: number
  body?: unknown
  /** Send the body back to the caller over the socket (not the initial reply). */
  broadcast?: boolean
}

type MaybePromise<T> = T | Promise<T>

/**
 * Per-invocation context, passed to every handler and middleware. Mirrors the
 * parts of Hono's `Context` that make handlers pleasant to write: typed state
 * (`get`/`set`), safe JSON/body parsing, and a way to talk to the socket.
 */
export interface WsContext {
  /** Raw AWS event. */
  event: WsEvent
  routeKey: string
  connectionId: string
  /** `userId` from the authorizer, available on every route. */
  userId?: string

  req: {
    /** Parsed JSON body, or `{}` when absent/invalid. */
    json: <T = Record<string, unknown>>() => T
    text: () => string
    query: (key: string) => string | undefined
    header: (name: string) => string | undefined
  }

  get: <T = unknown>(key: string) => T | undefined
  set: (key: string, value: unknown) => void

  /** Build a reply: `return c.reply(200, { ok: true })`. */
  reply: (statusCode: number, body?: unknown) => WsReply

  /** Persist data to DynamoDB and send the body to the caller. */
  send: (body: unknown) => Promise<WsReply>
  /** Send a payload to any connection (e.g. broadcast to a room). */
  postToConnection: (connectionId: string, body: unknown) => Promise<void>
}

export type WsHandler = (c: WsContext) => MaybePromise<WsReply | void | unknown>
export type WsMiddleware = (c: WsContext) => MaybePromise<WsReply | void>

/** Builder returned by `app.group(key)`; `on` is chainable. */
export interface WsGroupBuilder {
  on: (op: string, ...handlers: WsHandler[]) => WsGroupBuilder
}

const NO_CONTENT: WsReply = { statusCode: 200 }

function parseBody(event: WsEvent): unknown {
  if (!event.body) return undefined

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body

  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function createContext(event: WsEvent, client: () => ApiGatewayManagementApiClient): WsContext {
  const { requestContext } = event
  const parsed = parseBody(event)
  const state = new Map<string, unknown>()

  const c: WsContext = {
    event,
    routeKey: requestContext.routeKey,
    connectionId: requestContext.connectionId,
    userId: requestContext.authorizer?.userId ?? requestContext.authorizer?.principalId,
    req: {
      json: <T = Record<string, unknown>>() =>
        (parsed && typeof parsed === "object" ? parsed : {}) as T,
      text: () => (typeof parsed === "string" ? parsed : (event.body ?? "")),
      query: (key) => event.queryStringParameters?.[key],
      header: (name) => {
        const target = name.toLowerCase()
        const entry = Object.entries(event.headers ?? {}).find(
          ([header]) => header.toLowerCase() === target,
        )
        return entry?.[1]
      },
    },
    get: <T = unknown>(key: string) => state.get(key) as T | undefined,
    set: (key, value) => {
      state.set(key, value)
    },
    reply: (statusCode, body) => (body === undefined ? { statusCode } : { statusCode, body }),
    send: async (body) => {
      await c.postToConnection(requestContext.connectionId, body)
      return NO_CONTENT
    },
    postToConnection: async (connectionId, body) => {
      await client().send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(body)),
        }),
      )
    },
  }

  return c
}

/**
 * Small Hono-inspired router for API Gateway WebSocket routes. One Lambda can
 * serve `$connect`, `$disconnect`, `$default` and custom actions:
 *
 * ```ts
 * const app = new WsRouter();
 * app.use(authMiddleware);
 * app.route("$connect", onConnect);
 * app.route("message.send", onSend);
 * export const handler = app.handle();
 * ```
 */
export class WsRouter {
  private readonly routes = new Map<string, WsHandler[]>()
  private readonly groups = new Map<string, Map<string, WsHandler[]>>()
  private readonly middlewares: WsMiddleware[] = []
  private client?: ApiGatewayManagementApiClient

  /**
   * Routes whose invocations carry no authorizer context and no `{action}`
   * body. Middleware registered via `use()` is skipped for them, so an auth
   * or validation check can never fail the handshake itself.
   */
  private static readonly LIFECYCLE_ROUTES = new Set(["$connect", "$disconnect"])

  /** Register middleware, run in order before the route handlers. */
  use(...middleware: WsMiddleware[]): this {
    this.middlewares.push(...middleware)
    return this
  }

  /**
   * Register a route. Handlers run in order; the first reply returned wins,
   * and a handler that returns nothing passes to the next one (like Hono).
   */
  route(routeKey: string, ...handlers: WsHandler[]): this {
    const existing = this.routes.get(routeKey) ?? []
    this.routes.set(routeKey, [...existing, ...handlers])
    return this
  }

  /**
   * Groups several operations under one API Gateway route key. Frames carry
   * `action` (the route key, selected by the gateway) and `op`; `on` wires a
   * handler chain per `op`:
   *
   * ```ts
   * app.group("message")
   *   .on("send", sendMessageController)
   *   .on("edit", editMessageController);
   * ```
   */
  group(routeKey: string): WsGroupBuilder {
    const ops = this.groups.get(routeKey) ?? new Map<string, WsHandler[]>()
    this.groups.set(routeKey, ops)

    const builder: WsGroupBuilder = {
      on: (op, ...handlers) => {
        const existing = ops.get(op) ?? []
        ops.set(op, [...existing, ...handlers])
        return builder
      },
    }
    return builder
  }

  private get management(): ApiGatewayManagementApiClient {
    // Built lazily on first use: `$connect`/`$disconnect` rarely need it, and
    // the endpoint is only known once an event arrives.
    return (this.client ??= new ApiGatewayManagementApiClient({}))
  }

  private configureEndpoint(event: WsEvent) {
    const { domainName, stage } = event.requestContext
    if (domainName.includes("://")) {
      this.client = new ApiGatewayManagementApiClient({ endpoint: domainName })
      return
    }
    // A custom domain (e.g. ws.example.com) maps the stage at the root, so
    // appending /stage would push it into the request path — which breaks
    // the @connections callback and IAM authorization. Always call back
    // through the execute-api endpoint of the API that received the event.
    const { apiId } = event.requestContext as WsEvent["requestContext"] & { apiId?: string }
    const region = process.env.AWS_REGION ?? "ap-south-1"
    const url = apiId
      ? `https://${apiId}.execute-api.${region}.amazonaws.com/${stage}`
      : `https://${domainName}/${stage}`

    this.client = new ApiGatewayManagementApiClient({ endpoint: url })
  }

  /** Lambda entry point factory. */
  handle() {
    return async (event: WsEvent): Promise<WsReply> => {
      if (!event?.requestContext?.routeKey) {
        return toGatewayReply({ statusCode: 400, body: { message: "Invalid Request." } })
      }

      this.configureEndpoint(event)
      const c = createContext(event, () => this.management)

      const routeKey = event.requestContext.routeKey

      try {
        if (!WsRouter.LIFECYCLE_ROUTES.has(routeKey)) {
          for (const middleware of this.middlewares) {
            const early = await middleware(c)
            if (early) return toGatewayReply(early)
          }
        }

        const groupOps = this.groups.get(routeKey)
        if (groupOps) {
          const op = c.req.json<{ op?: string }>().op
          const opHandlers = op ? groupOps.get(op) : undefined

          if (!opHandlers) {
            return toGatewayReply({
              statusCode: 400,
              body: {
                message: op ? `Unknown op "${op}" for ${routeKey}` : `Missing op for ${routeKey}`,
              },
            })
          }

          for (const handler of opHandlers) {
            const result = await handler(c)
            if (result === undefined || result === null) continue
            if (typeof result === "object" && "statusCode" in (result as WsReply)) {
              return toGatewayReply(result as WsReply)
            }
            await c.postToConnection(c.connectionId, result)
          }

          return NO_CONTENT
        }

        const handlers = this.routes.get(routeKey) ?? this.routes.get("$default")

        if (!handlers || handlers.length === 0) {
          return routeKey === "$disconnect"
            ? NO_CONTENT
            : toGatewayReply({ statusCode: 404, body: { message: `No handler for ${routeKey}` } })
        }

        for (const handler of handlers) {
          const result = await handler(c)

          if (result === undefined || result === null) continue

          if (typeof result === "object" && "statusCode" in (result as WsReply)) {
            return toGatewayReply(result as WsReply)
          }

          await c.postToConnection(c.connectionId, result)
        }

        return NO_CONTENT
      } catch (error) {
        console.error(`WS ${routeKey} failed for ${c.connectionId}`, error)
        return toGatewayReply({
          statusCode: 500,
          body: { message: "Internal error. Please try again." },
        })
      }
    }
  }
}

/**
 * API Gateway's WebSocket integration requires the Lambda response `body` to
 * be a string; returning an object makes the handshake fail with a 502 even
 * when the handler itself succeeded.
 */
function toGatewayReply(reply: WsReply): WsReply {
  if (reply.body === undefined || typeof reply.body === "string") return reply
  return { ...reply, body: JSON.stringify(reply.body) }
}

/** Functional alias for `handler = handleWs(app)`. */
export const handleWs = (app: WsRouter) => app.handle()
