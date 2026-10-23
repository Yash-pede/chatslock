/**
 * Deep-link + store plumbing for chatslock's chat links.
 *
 * A shared link looks like:
 *   https://chatslock.com/u/<id>
 *
 * When the app is installed, the OS claims that https URL via Android App Links
 * / iOS Universal Links and opens chatslock directly — the browser never loads.
 * When the app is not installed, the browser lands here and we fall back to the
 * store (see AgentRedirect).
 *
 * TODO(real ids): replace the placeholder store identifiers below once the app
 * is published. `eas.json` / `app.json` will hold the real ones.
 */

export type Platform = "android" | "ios" | "desktop"

export const APP_LINKS = {
  /** Canonical production host. The demo falls back to window.location.origin. */
  domain: "chatslock.com",
  /** Custom scheme registered in apps/chat/app.json ("scheme": "chatslock"). */
  scheme: "chatslock",
  /** Primary https path segment, i.e. /u/<id>. */
  linkPath: "u",
  androidPackage: "com.chatslock.app",
  iosAppId: "0000000000",
} as const

/** Path segments accepted on the https link, e.g. /u/<id>, /a/<id>, /agent/<id>. */
const LINK_ALIASES = [APP_LINKS.linkPath, "a", "agent"]

/** Detects the mobile platform from the user agent. */
export function detectPlatform(): Platform {
  const ua = navigator.userAgent || ""

  if (/android/i.test(ua)) return "android"
  // iPadOS reports as Macintosh, so also match the touch-point tell.
  if (/iphone|ipad|ipod/i.test(ua)) return "ios"
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios"

  return "desktop"
}

/** The https share link for a chat, e.g. https://host/u/abc123. */
export function buildShareUrl(id: string, origin = window.location.origin): string {
  return `${origin}/${APP_LINKS.linkPath}/${encodeURIComponent(id)}`
}

/** The custom-scheme link that hands off to the installed app. */
export function buildAppDeepLink(id: string): string {
  return `${APP_LINKS.scheme}://${APP_LINKS.linkPath}/${encodeURIComponent(id)}`
}

/**
 * Android `intent://` URL. Chrome resolves it natively: the app opens when it's
 * installed, otherwise the browser follows `S.browser_fallback_url` — so the
 * store fallback is carried in the URL itself instead of a JS timer.
 */
export function buildAndroidIntentUrl(id: string): string {
  const path = `${APP_LINKS.linkPath}/${encodeURIComponent(id)}`
  const fallback = encodeURIComponent(buildStoreUrl("android", id))
  return `intent://${path}#Intent;scheme=${APP_LINKS.scheme};package=${APP_LINKS.androidPackage};S.browser_fallback_url=${fallback};end`
}

/**
 * Store URL for a platform. On Android the chat id rides along as the Play
 * Install Referrer so the app can resume the conversation after install.
 */
export function buildStoreUrl(platform: Platform, id?: string): string {
  if (platform === "android") {
    const base = `https://play.google.com/store/apps/details?id=${APP_LINKS.androidPackage}`
    return id ? `${base}&referrer=${encodeURIComponent(`chatId=${id}`)}` : base
  }

  if (platform === "ios") {
    return `https://apps.apple.com/app/id${APP_LINKS.iosAppId}`
  }

  // Desktop: send to the Play listing as a neutral default.
  return `https://play.google.com/store/apps/details?id=${APP_LINKS.androidPackage}`
}

/**
 * Extracts a chat id from a URL. Understands /u/<id>, /a/<id>, /agent/<id> and
 * the ?c=<id> query fallback (useful when a host can't rewrite deep paths to
 * index.html).
 */
export function resolveChatId(pathname: string, search: string): string | null {
  const segments = pathname.split("/").filter(Boolean)
  const [first, second] = segments

  if (first && second && (LINK_ALIASES as readonly string[]).includes(first)) {
    return decodeURIComponent(second)
  }

  const fromQuery = new URLSearchParams(search).get("c")
  return fromQuery ? decodeURIComponent(fromQuery) : null
}
