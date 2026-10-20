import {CognitoIdentityProviderClient} from "@aws-sdk/client-cognito-identity-provider";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export class AWSManager {
    public static readonly cognitoClient = new CognitoIdentityProviderClient();
    public static readonly dynamodbClient = new DynamoDBClient();
    public static readonly dbClient = DynamoDBDocumentClient.from(AWSManager.dynamodbClient)
    private readonly secretsManagerClient = new SecretsManagerClient();

    async getSecretValue(secretName: string) {
        const response = await this.secretsManagerClient.send(
            new GetSecretValueCommand({
                SecretId: process.env.SECRET_NAME,
            }));

        if (!response.SecretString) return undefined;

        const secret = JSON.parse(response.SecretString);
        return secret[secretName];
    }

}

export const awsManagerInstance = new AWSManager();