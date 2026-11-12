import { Redirect } from "expo-router"

/**
 * Signed-out users go straight to the phone OTP screen. Agent sign-in is still
 * reachable at `/login/agent`, but only through the hidden version-tap gesture
 * on that screen so it is not advertised in the UI.
 */
export default function LoginIndexScreen() {
  return <Redirect href="/login/user" />
}
