import { useEffect } from "react"
import { Redirect, useLocalSearchParams } from "expo-router"
import { useProfile } from "@/context/profile/ProfileContext"

const MIN_USERNAME_LENGTH = 3
const MAX_USERNAME_LENGTH = 20

/**
 * Shared profile link (`chatslock.com/u/<username>`). It carries the invite
 * username into the session: signed-out visitors go through phone OTP and
 * onboarding picks the username up again.
 *
 * A real profile view (view another user and start a chat while signed in) is
 * not implemented yet; signed-in users are sent to the app for now.
 */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { flow, user, setPendingAgentId } = useProfile()

  const agentUsername = typeof id === "string" ? id.trim().toLowerCase() : ""
  const isLinkable =
    agentUsername.length >= MIN_USERNAME_LENGTH && agentUsername.length <= MAX_USERNAME_LENGTH
  const isOwnProfile = agentUsername.length > 0 && agentUsername === user?.username

  useEffect(() => {
    if (isLinkable && !isOwnProfile) setPendingAgentId(agentUsername)
  }, [agentUsername, isLinkable, isOwnProfile, setPendingAgentId])

  // A link can arrive signed out, mid-onboarding or inside the app; the flow
  // already encodes which of those applies.
  if (flow === "ready") return <Redirect href="/" />
  if (flow === "onboarding") return <Redirect href="/onboarding" />
  return <Redirect href="/login/user" />
}
