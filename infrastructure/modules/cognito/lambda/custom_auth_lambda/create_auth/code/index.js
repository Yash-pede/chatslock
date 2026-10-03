import crypto from "crypto";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const secretsClient = new SecretsManagerClient({});

let cachedSecret; // cache across warm invocations

async function getSecrets() {
  if (cachedSecret) return cachedSecret;

  const command = new GetSecretValueCommand({
    SecretId: process.env.SECRET_NAME,
  });

  const response = await secretsClient.send(command);

  cachedSecret = JSON.parse(response.SecretString);

  return cachedSecret;
}
export const handler = async (event) => {
  console.log("CreateAuthChallenge:", JSON.stringify(event));

  if (event.request.challengeName === "CUSTOM_CHALLENGE") {
    const otp = crypto.randomInt(100000, 999999).toString();

    const phone = event.request.userAttributes.phone_number;
    const secrets = await getSecrets();

    const smsUrl = secrets.SMS_URL;
    const bearerToken = secrets.SMS_BEARER_TOKEN;

    if (!(smsUrl || bearerToken)) {
      throw new Error("Missing env parameters");
    }
    if (!phone) {
      throw new Error("Phone number not found in user attributes");
    }

    try {
      const response = await fetch(smsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone.replace("+", ""),
          type: "template",
          template: {
            name: "infoneww",
            language: {
              code: "en",
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: otp,
                  },
                ],
              },
            ],
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("SMS API Error:", errorBody);
        throw new Error("Failed to send OTP");
      }

      console.log("OTP sent successfully to:", phone);
    } catch (err) {
      console.error("Error sending OTP:", err);
      throw err; // IMPORTANT: fail auth if SMS fails
    }

    // Store OTP securely in Cognito session
    event.response.privateChallengeParameters = {
      otp,
      createdAt: Date.now().toString(),
    };

    event.response.publicChallengeParameters = {
      challenge: "OTP_SENT",
    };

    event.response.challengeMetadata = "OTP_CHALLENGE";
  }

  return event;
};
