export const handler = async (event) => {
  console.log("VerifyAuthChallengeResponse:", JSON.stringify(event));

  const expectedOtp = event.request.privateChallengeParameters.otp;
  const providedOtp = event.request.challengeAnswer;

  if (providedOtp === expectedOtp) {
    event.response.answerCorrect = true;
  } else {
    event.response.answerCorrect = false;
  }

  return event;
};
