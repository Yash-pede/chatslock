import { buildStoreUrl } from "../lib/app-links"

type StoreButtonsProps = {
  agentId?: string
}

/**
 * App Store + Play Store download buttons. Both stores accept the link even
 * from the "wrong" platform (they bounce to a landing page), so we always show
 * both and let the user pick.
 */
export function StoreButtons({ agentId }: StoreButtonsProps) {
  const play = buildStoreUrl("android", agentId)
  const appStore = buildStoreUrl("ios", agentId)

  return (
    <div className="store-buttons">
      <a className="store-button" href={play} target="_blank" rel="noreferrer">
        <span className="store-button__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M3.6 2.3a1.5 1.5 0 0 0-.8 1.4v16.6a1.5 1.5 0 0 0 .8 1.4l9.3-9.7L3.6 2.3Zm11-1.1L5.9 6.6l8.7 5.4 3.4-2a1.6 1.6 0 0 0 0-2.8l-3.4-2ZM5.9 17.4l8.7-5.4-8.7-5.4v10.8Zm8.7-5.4 3.4 2 3.4-2a1.6 1.6 0 0 0 0-2.8l-3.4-2-3.4 2 2 1.4-2 1.4Z" />
          </svg>
        </span>
        <span className="store-button__text">
          <small>Get it on</small>
          <strong>Google Play</strong>
        </span>
      </a>

      <a className="store-button" href={appStore} target="_blank" rel="noreferrer">
        <span className="store-button__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.8-2.2.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.5ZM14.1 5.6c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2-.5 2.6-1.3Z" />
          </svg>
        </span>
        <span className="store-button__text">
          <small>Download on the</small>
          <strong>App Store</strong>
        </span>
      </a>
    </div>
  )
}
