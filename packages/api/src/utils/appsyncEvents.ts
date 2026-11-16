import type { OutgoingHttpHeaders } from "node:http"
import { request as httpsRequest } from "node:https"
import aws4 from "aws4"
import { AWSManager } from "./awsConfig"

const PUBLISH_TIMEOUT_MS = 5_000

interface HttpResponse {
  status: number
  body: string
}

/** Minimal HTTPS POST so the signed `Host` header is sent untouched. */
function post(url: URL, body: string, headers: OutgoingHttpHeaders): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        })
      },
    )

    request.setTimeout(PUBLISH_TIMEOUT_MS, () => {
      request.destroy(new Error("AppSync publish timed out"))
    })
    request.on("error", reject)
    request.end(body)
  })
}

/**
 * Publishes one event to an AppSync Events channel over the HTTP endpoint.
 *
 * The realtime Lambda uses this to speak for a user (presence) without holding a
 * Cognito token. The Event API must expose AWS_IAM as a publish auth mode and
 * the Lambda role needs `appsync:EventPublish`.
 */
export async function publishAppSyncEvent(channel: string, event: unknown): Promise<void> {
  const configuredEndpoint = await AWSManager.getSecretValue("appsync_endpoint")
  if (!configuredEndpoint) {
    throw new Error("AppSync endpoint is not configured in the API secret")
  }

  // The secret stores the API's HTTP base URL; publishing is POST <base>/event.
  const base = configuredEndpoint.replace(/\/+$/, "")
  const url = new URL(base.startsWith("http") ? base : `https://${base}`)
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/event`

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials are not available to publish the event")
  }

  const body = JSON.stringify({
    channel,
    events: [JSON.stringify(event)],
  })

  const request = {
    host: url.host,
    path: `${url.pathname}${url.search}`,
    method: "POST",
    service: "appsync",
    region: process.env.AWS_REGION ?? "us-east-1",
    headers: { "Content-Type": "application/json" } as OutgoingHttpHeaders,
    body,
  }

  aws4.sign(request, {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  })

  const response = await post(url, body, request.headers)

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`AppSync publish failed (${response.status}): ${response.body.slice(0, 300)}`)
  }
}
