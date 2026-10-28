import { StoreButtons } from "../components/StoreButtons"

/** Support address used by the Play listing and the legal pages. */
export const CONTACT_EMAIL = "support@chatslock.com"

const LAST_UPDATED = "October 28, 2026"

interface LegalPageProps {
  title: string
  intro?: string
  children: React.ReactNode
}

/**
 * Shared shell for the pages the store and the public need to reach: policy,
 * terms, account deletion and support. Plain static HTML-friendly markup so it
 * works with the CloudFront `index.html` fallback on deep links.
 */
export function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <div className="page">
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand__mark" aria-hidden="true" />
          chatslock
        </a>
        <nav className="site-nav">
          <a href="/">Home</a>
        </nav>
      </header>

      <main className="legal">
        <h1>{title}</h1>
        <p className="legal__meta">Last updated {LAST_UPDATED}</p>
        {intro ? <p className="lede">{intro}</p> : null}
        {children}
        <p>
          Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
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

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="chatslock is a private messaging app. We collect only what is needed to run your account and deliver your messages."
    >
      <h2>What we collect</h2>
      <ul>
        <li>Your phone number, used to sign you in with a one-time code.</li>
        <li>Your name, username and optional profile photo.</li>
        <li>The messages you send and receive, and who you talk to.</li>
        <li>Basic technical data needed to operate the service (account id, timestamps).</li>
      </ul>

      <h2>What we do not collect</h2>
      <ul>
        <li>No location data, contacts, calendar, or advertising identifiers.</li>
        <li>No third-party analytics or advertising SDKs.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To create and secure your account, deliver and store your conversations, prevent abuse, and
        keep the service working. We do not sell your data.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Only our infrastructure providers (Amazon Web Services) that host the app and database. They
        process data on our behalf and do not use it for their own purposes.
      </p>

      <h2>Security</h2>
      <p>
        Traffic is encrypted in transit and messages are encrypted at rest. Access to your account
        requires a one-time code sent to your phone number.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Your account and messages are kept while your account exists. You can ask us to delete your
        account and data at any time — see <a href="/delete-account">Delete your account</a>.
      </p>

      <h2>Children</h2>
      <p>
        chatslock is not intended for anyone under 18, and we do not knowingly collect data from
        children.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes we will update this page and the date above.</p>
    </LegalPage>
  )
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of service" intro="By using chatslock you agree to these terms.">
      <h2>Your account</h2>
      <p>
        Provide accurate information, keep access to your phone number, and do not share your
        verification codes. You are responsible for activity on your account.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>No harassment, threats, hate speech or illegal content.</li>
        <li>No spam, impersonation, or attempts to break the service or other accounts.</li>
        <li>No using chatslock to harm or defraud anyone.</li>
      </ul>
      <p>We may suspend or remove accounts that break these rules.</p>

      <h2>Content</h2>
      <p>
        You keep ownership of what you send. You give us permission to store and transmit it only to
        run the service.
      </p>

      <h2>Availability</h2>
      <p>
        chatslock is provided as is. We work to keep it running but do not guarantee uninterrupted
        service, and we are not liable for indirect losses.
      </p>

      <h2>Ending use</h2>
      <p>
        You can stop using chatslock and request deletion at any time via{" "}
        <a href="/delete-account">Delete your account</a>.
      </p>
    </LegalPage>
  )
}

export function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      intro="You can request deletion of your chatslock account and the data associated with it."
    >
      <h2>How to request deletion</h2>
      <ol>
        <li>
          Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20account`}>{CONTACT_EMAIL}</a> from
          any address, with the subject “Delete my account”.
        </li>
        <li>Include the phone number you use to sign in to chatslock.</li>
        <li>We verify the request and confirm once it is done.</li>
      </ol>

      <h2>What is deleted</h2>
      <ul>
        <li>Your profile: name, username, photo and phone-based account.</li>
        <li>Your conversations and messages.</li>
        <li>Your sign-in credentials, so you can no longer access the app.</li>
      </ul>

      <h2>Timing</h2>
      <p>
        Requests are handled within 30 days. Limited records may be kept where the law requires it,
        and backups are purged on their normal cycle.
      </p>
    </LegalPage>
  )
}

export function SupportPage() {
  return (
    <LegalPage
      title="Support"
      intro="Need help with chatslock? We usually reply within two working days."
    >
      <h2>Contact</h2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Include your phone number
        (never your verification code) and a short description of the issue.
      </p>

      <h2>Common questions</h2>
      <p>
        <strong>Didn't get a code?</strong> Wait for the resend timer, check your signal, then tap
        Resend. Requests are rate limited for security.
      </p>
      <p>
        <strong>Wrong number?</strong> On the code screen tap “Change number” and sign in again.
      </p>
      <p>
        <strong>Delete your data?</strong> See <a href="/delete-account">Delete your account</a>.
      </p>

      <h2>Get the app</h2>
      <StoreButtons />
    </LegalPage>
  )
}
