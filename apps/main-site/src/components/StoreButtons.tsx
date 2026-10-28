import { buildStoreUrl } from "../lib/app-links"

type StoreButtonsProps = {
  agentId?: string
}

/**
 * App Store + Play Store download badges. Uses the official artwork from Apple
 * and Google (`public/badges/`) instead of hand-drawn icons, and the store's own
 * link so the app is one tap away on the matching platform.
 */
export function StoreButtons({ agentId }: StoreButtonsProps) {
  const play = buildStoreUrl("android", agentId)
  const appStore = buildStoreUrl("ios", agentId)

  return (
    <div className="store-badges">
      <a href={play} target="_blank" rel="noreferrer" aria-label="Get it on Google Play">
        <img
          className="store-badge store-badge--play"
          src="/badges/google-play.png"
          alt="Get it on Google Play"
          width={148}
          height={44}
        />
      </a>
      <a href={appStore} target="_blank" rel="noreferrer" aria-label="Download on the App Store">
        <img
          className="store-badge store-badge--apple"
          src="/badges/app-store.svg"
          alt="Download on the App Store"
          width={132}
          height={44}
        />
      </a>
    </div>
  )
}
