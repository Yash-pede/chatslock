import { useEffect } from "react"
import { Redirect, useLocalSearchParams } from "expo-router"
import { PublicProfilePage } from "@/components/profile/public-profile-page"
import { useProfile } from "@/context/profile/ProfileContext"

const MIN_USERNAME_LENGTH = 3
const MAX_USERNAME_LENGTH = 20

/**
 * Shared profile link (`chatslock.com/u/<username>`).
 * - signed out / onboarding: carries the invite username into the session;
 * - signed in: shows the public profile (avatar, name, last active) in-app.
 */
export default function PublicProfileLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { flow, user, setPendingAgentId } = useProfile()

  const username = typeof id === "string" ? id.trim().toLowerCase() : ""
  const isLinkable =
    username.length >= MIN_USERNAME_LENGTH && username.length <= MAX_USERNAME_LENGTH
  const isOwnProfile = Boolean(username && username === user?.username)

  useEffect(() => {
    if (isLinkable && !isOwnProfile) setPendingAgentId(username)
  }, [isLinkable, isOwnProfile, setPendingAgentId, username])

  if (flow === "ready") {
    if (isOwnProfile) return <Redirect href="/profile" />
    if (!isLinkable) return <Redirect href="/" />
    return <PublicProfilePage username={username} />
  }

  if (flow === "onboarding") return <Redirect href="/onboarding" />
  return <Redirect href="/login/user" />
}
