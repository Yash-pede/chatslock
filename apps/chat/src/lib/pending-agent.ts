import * as Application from "expo-application"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"

const PENDING_AGENT_KEY = "pending_agent_username"
const REFERRER_CHECKED_KEY = "install_referrer_checked"
const MIN_USERNAME_LENGTH = 3
const MAX_USERNAME_LENGTH = 20

export function isValidAgentUsername(value: string): boolean {
  return value.length >= MIN_USERNAME_LENGTH && value.length <= MAX_USERNAME_LENGTH
}

/** The invitee username carried by a `/u/<username>` link or Play referrer. */
export async function loadPendingAgent(): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(PENDING_AGENT_KEY)
    return value && isValidAgentUsername(value) ? value : null
  } catch {
    return null
  }
}

export async function savePendingAgent(username: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_AGENT_KEY, username)
  } catch (error) {
    console.warn("[referrer] failed to persist pending agent", error)
  }
}

export async function clearPendingAgent(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_AGENT_KEY)
  } catch (error) {
    console.warn("[referrer] failed to clear pending agent", error)
  }
}

/**
 * Play passes `&referrer=agentId%3D<username>` through the store install.
 * Returns the username, or null when the referrer is missing/invalid.
 */
export function parseAgentReferrer(referrer: string): string | null {
  let decoded = referrer
  try {
    decoded = decodeURIComponent(referrer)
  } catch {
    // Keep the raw value when it contains a stray '%'.
  }

  const match = /(?:^|[?&])agentId=([^&]*)/.exec(decoded)
  if (!match?.[1]) return null

  const value = match[1].trim().toLowerCase()
  return isValidAgentUsername(value) ? value : null
}

/**
 * Reads the Play Install Referrer once per install. Reading it on every launch
 * would re-apply an old invite after onboarding has already consumed it.
 */
export async function readInstallReferrerAgentOnce(): Promise<string | null> {
  if (Platform.OS !== "android") return null

  try {
    if (await SecureStore.getItemAsync(REFERRER_CHECKED_KEY)) return null

    const referrer = await Application.getInstallReferrerAsync()
    await SecureStore.setItemAsync(REFERRER_CHECKED_KEY, "1")
    return parseAgentReferrer(referrer)
  } catch (error) {
    // Expo Go and non-Play installs have no referrer; don't retry forever.
    try {
      await SecureStore.setItemAsync(REFERRER_CHECKED_KEY, "1")
    } catch {
      // ignore
    }
    console.warn("[referrer] could not read Play install referrer", error)
    return null
  }
}
