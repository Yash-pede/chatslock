import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider"
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"
import { S3Client } from "@aws-sdk/client-s3"
import Redis from "ioredis"

type Secret = { id?: string; values?: Record<string, string> }

/**
 * Lambda-only AWS access. Everything is created on first use so that importing
 * a client-side entrypoint of `@repo/api` never pulls AWS SDKs into a bundle.
 */
export class AWSManager {
  private static cognito?: CognitoIdentityProviderClient
  private static dynamo?: DynamoDBClient
  private static document?: DynamoDBDocumentClient
  private static s3?: S3Client
  private static secrets?: SecretsManagerClient
  private static secretsCache?: Secret
  private static secretsInFlight?: Promise<Secret>
  private static cache: Redis

  static get cognitoClient() {
    return (AWSManager.cognito ??= new CognitoIdentityProviderClient())
  }

  static get dynamodbClient() {
    return (AWSManager.dynamo ??= new DynamoDBClient())
  }

  static get dbClient() {
    return (AWSManager.document ??= DynamoDBDocumentClient.from(AWSManager.dynamodbClient, {
      marshallOptions: {
        convertClassInstanceToMap: true,
      },
    }))
  }

  static get s3Client() {
    return (AWSManager.s3 ??= new S3Client())
  }

  static async cacheClient() {
    if (AWSManager.cache) return AWSManager.cache

    const host = await this.getSecretValue("cache_endpoint")
    const port = await this.getSecretValue("cache_port")

    if (!host || !port) {
      throw new Error("Cache endpoint is not configured in the API secret")
    }

    return (AWSManager.cache ??= new Redis({
      host,
      port: Number.parseInt(port, 10),
      // ElastiCache Serverless always encrypts in transit, so the client must
      // speak TLS. `servername` is required for SNI certificate validation.
      tls: { servername: host },
      connectTimeout: 5_000,
      maxRetriesPerRequest: 3,
    }))
  }

  private static get secretsManagerClient() {
    return (AWSManager.secrets ??= new SecretsManagerClient())
  }

  static async getSecretValue(secretName: string): Promise<string | undefined> {
    const pending = (AWSManager.secretsInFlight ??= AWSManager.loadSecret().finally(() => {
      AWSManager.secretsInFlight = undefined
    }))
    const secret = await pending
    return secret.values?.[secretName]
  }

  private static async loadSecret(): Promise<Secret> {
    const id = process.env.SECRET_NAME
    const cached = AWSManager.secretsCache
    if (cached && cached.id === id) return cached

    const response = await AWSManager.secretsManagerClient.send(
      new GetSecretValueCommand({ SecretId: id }),
    )
    const values = response.SecretString
      ? (JSON.parse(response.SecretString) as Record<string, string>)
      : undefined

    const secret: Secret = { id, values }
    return (AWSManager.secretsCache = secret)
  }
}
