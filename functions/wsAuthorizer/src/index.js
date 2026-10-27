import { CognitoJwtVerifier } from "aws-jwt-verify"
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

const secretsClient = new SecretsManagerClient({})

/** Header lookup is case-insensitive: proxies and clients vary the casing. */
function getHeader(event, name) {
  const target = name.toLowerCase()
  const headers = event?.headers ?? {}
  const key = Object.keys(headers).find((header) => header.toLowerCase() === target)
  return key ? headers[key] : undefined
}

let cachedSecret

async function getSecrets() {
  if (cachedSecret) return cachedSecret

  const command = new GetSecretValueCommand({
    SecretId: process.env.SECRET_NAME,
  })

  const response = await secretsClient.send(command)

  cachedSecret = JSON.parse(response.SecretString)

  return cachedSecret
}

export const handler = async (event) => {
  const secrets = await getSecrets()
  const verifier = CognitoJwtVerifier.create({
    userPoolId: secrets.cognito_user_pool_id,
    tokenUse: "access",
    clientId: [secrets.cognito_admin_client_id, secrets.cognito_user_client_id],
  })

  // Browsers cannot set headers on a WebSocket handshake, so the token also
  // travels in the query string.
  const token = event.queryStringParameters?.token || getHeader(event, "authorization")

  if (typeof token !== "string" || !token.trim()) {
    console.error("WS auth failed: missing token", {
      routeKey: event.requestContext?.routeKey,
      hasQueryParams: Boolean(event.queryStringParameters),
      queryKeys: Object.keys(event.queryStringParameters ?? {}),
    })
    return generateDenyPolicy(event.methodArn)
  }

  const cleanToken = token.startsWith("Bearer ") ? token.substring(7) : token

  try {
    const payload = await verifier.verify(cleanToken)

    return generateAllowPolicy(payload.sub, event.methodArn, payload)
  } catch (error) {
    // Log why the token was refused (`jwt expired`, `invalid signature`,
    // audience/token_use mismatch, or JWKS fetch failure from the VPC).
    console.error("WS auth failed", {
      message: error?.message ?? String(error),
      name: error?.name,
      userPoolId: secrets.cognito_user_pool_id,
      tokenLength: cleanToken.length,
    })
    // WebSocket REQUEST authorizers only accept IAM policy responses; a
    // statusCode object makes API Gateway fail the handshake with a 500.
    return generateDenyPolicy(event.methodArn)
  }
}

function generateDenyPolicy(resource) {
  return {
    principalId: "anonymous",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Deny",
          Resource: resource,
        },
      ],
    },
  }
}

function generateAllowPolicy(principalId, resource, payload) {
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: resource,
        },
      ],
    },
    context: {
      userId: payload.sub,
      clientId: payload.client_id,
    },
  }
}
