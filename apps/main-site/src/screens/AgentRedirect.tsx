import { useEffect, useState } from "react"
import { StoreButtons } from "../components/StoreButtons"
import {
  buildAndroidIntentUrl,
  buildAppDeepLink,
  buildShareUrl,
  buildStoreUrl,
  detectPlatform,
  type Platform,
} from "../lib/app-links"

type AgentRedirectProps = {
  agentId: string
}

type Status = "opening" | "store"

/** How long we wait for the app to take over before assuming it's not installed. */
const OPEN_TIMEOUT_MS = 1600

/**
 * The page a share link lands on when the OS did NOT hand off to the app
 * (i.e. the app isn't installed, or the user is on desktop).
 *
 * On mobile we still try the app once (Android: intent://, iOS: custom scheme)
 * — if the app is installed the page freezes/goes hidden and we never redirect.
 * Otherwise we fall back to the store, forwarding the agent id so the
 * conversation can be resumed.
 */
export default function AgentRedirect({ agentId }: AgentRedirectProps) {
  const [platform] = useState<Platform>(() => detectPlatform())
  const [status, setStatus] = useState<Status>(platform === "desktop" ? "store" : "opening")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (platform === "desktop") {
      return
    }

    let appTookOver = false
    const markTakenOver = () => {
      appTookOver = true
    }

    document.addEventListener("visibilitychange", markTakenOver)
    window.addEventListener("pagehide", markTakenOver)
    window.addEventListener("blur", markTakenOver)

    // Android: intent:// opens the app or follows S.browser_fallback_url to the
    // Play listing. iOS/other: custom scheme, store fallback via the timer below.
    window.location.href =
      platform === "android" ? buildAndroidIntentUrl(agentId) : buildAppDeepLink(agentId)

    const timer = window.setTimeout(() => {
      const stillVisible = document.visibilityState === "visible"
      if (!appTookOver && stillVisible) {
        setStatus("store")
        window.location.replace(buildStoreUrl(platform, agentId))
      }
    }, OPEN_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", markTakenOver)
      window.removeEventListener("pagehide", markTakenOver)
      window.removeEventListener("blur", markTakenOver)
    }
  }, [agentId, platform])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildShareUrl(agentId))
    } catch {
      // Best effort — the visible link still works.
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="page page--centered">
      <div className="redirect">
        <div className="redirect__glow" aria-hidden="true" />

        <div className="redirect__agent">
          <span className="redirect__avatar" aria-hidden="true" />
          <div>
            <strong>{agentId}</strong>
            <small>encrypted conversation</small>
          </div>
        </div>

        {status === "opening" ? (
          <>
            <div className="spinner" aria-hidden="true" />
            <h1>Opening chatslock…</h1>
            <p className="redirect__sub">
              Taking you to your private chat with <strong>{agentId}</strong>.
            </p>
          </>
        ) : (
          <>
            <h1>Get chatslock to chat</h1>
            <p className="redirect__sub">
              The app isn't on this device yet. Install it and you'll land right back in this chat.
            </p>
          </>
        )}

        <div className="redirect__stores">
          <StoreButtons agentId={agentId} />
        </div>

        <div className="redirect__actions">
          <a className="ghost-button" href={buildAppDeepLink(agentId)}>
            Already installed? Open in app
          </a>
          <button type="button" className="ghost-button" onClick={copyLink}>
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>

        <a className="redirect__home" href="/">
          ← Back to chatslock.com
        </a>
      </div>
    </div>
  )
}
