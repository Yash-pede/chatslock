import { useEffect } from "react"
import { Redirect, useLocalSearchParams } from "expo-router"
import { useIdentity } from "@/context/AuthContext"
import { useProfile } from "@/context/profile/ProfileContext"

/** Cognito `sub` values are UUIDs; anything else is not a profile id. */
const USER_ID_PATTERN = /^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i

/**
 * Public profile link (`chatslock.com/u/<agentId>`). It only exists to carry the
 * agent id into the session: signed-out visitors are sent to the phone OTP flow,
 * which keeps the id and passes it to the onboarding call once verified.
 *
 * Viewing another user's profile is not implemented yet, so signed-in users are
 * sent to the app for now.
 */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const identity = useIdentity()
  const { flow, setPendingAgentId } = useProfile()

  const isOwnProfile = typeof id === "string" && id === identity?.id
  const isLinkableAgent = typeof id === "string" && USER_ID_PATTERN.test(id)

  useEffect(() => {
    if (isLinkableAgent && !isOwnProfile) setPendingAgentId(id)
  }, [id, isLinkableAgent, isOwnProfile, setPendingAgentId])

  // A link can arrive signed out, mid-onboarding or inside the app; the flow
  // already encodes which of those applies.
  if (flow === "ready") return <Redirect href="/" />
  if (flow === "onboarding") return <Redirect href="/onboarding" />
  return <Redirect href="/login/user" />
}
