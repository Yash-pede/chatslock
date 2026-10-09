import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

export const CognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION,
});
