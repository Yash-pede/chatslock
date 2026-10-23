/**
 * Absolute URLs used outside the API (shared links, deep links). Configured via
 * `EXPO_PUBLIC_MAIN_SITE_URL` so a staging build can point elsewhere; the
 * production site is the last-resort fallback.
 */
const MAIN_SITE_URL = (
  process.env.EXPO_PUBLIC_MAIN_SITE_URL?.trim() || "https://chatslock.com"
).replace(/\/+$/, "")

/** Public web profile for a user/agent: `<main site>/u/<userId>`. */
export function userProfileUrl(userId: string): string {
  return `${MAIN_SITE_URL}/u/${userId}`
}
