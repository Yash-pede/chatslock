export const handler = async (event) => {
  console.log("DefineAuthChallenge:", JSON.stringify(event));

  if (!event.request.session || event.request.session.length === 0) {
    // First request → ask for custom challenge
    event.response.challengeName = "CUSTOM_CHALLENGE";
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
  } else if (
    event.request.session.length === 1 &&
    event.request.session[0].challengeName === "CUSTOM_CHALLENGE" &&
    event.request.session[0].challengeResult === true
  ) {
    // OTP correct → issue tokens
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
  } else {
    // OTP wrong
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
  }

  return event;
};
