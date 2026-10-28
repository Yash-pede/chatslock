import { StoreButtons } from "../components/StoreButtons"

/**
 * chatslock.com — a private, encrypted chat app. That's it.
 */
export default function LandingPage() {
  return (
    <div className="page">
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand__mark" aria-hidden="true" />
          chatslock
        </a>
        <nav className="site-nav">
          <a className="site-nav__cta" href="#get">
            Get the app
          </a>
        </nav>
      </header>

      <main className="hero">
        <p className="eyebrow">Private, encrypted messaging</p>
        <h1>Chat that stays locked.</h1>
        <p className="lede">
          chatslock is a secure messaging app. Every conversation is encrypted, end to end.
        </p>
        <div id="get">
          <StoreButtons />
        </div>
      </main>

      <footer className="site-footer">
        <span>chatslock</span>
        <span className="site-footer__links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/delete-account">Delete account</a>
          <a href="/support">Support</a>
        </span>
      </footer>
    </div>
  )
}
