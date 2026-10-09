import {CognitoIdentityProviderClient} from "@aws-sdk/client-cognito-identity-provider";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";

export class AWSManager {
    public static readonly cognitoClient = new CognitoIdentityProviderClient();
    private readonly secretsManagerClient = new SecretsManagerClient();

    async getSecretValue(secretName: string) {
        const response = await this.secretsManagerClient.send(
            new GetSecretValueCommand({
                SecretId: process.env.SECRET_NAME,
            }));

        return response.SecretString ? JSON.parse(response.SecretString) : undefined;
    }

}

export const awsManagerInstance = new AWSManager();