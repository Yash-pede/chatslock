import { useEffect, useState } from "react"
import LandingPage from "./screens/LandingPage"
import AgentRedirect from "./screens/AgentRedirect"
import {
  DeleteAccountPage,
  PrivacyPage,
  SupportPage,
  TermsPage,
} from "./screens/LegalPages"
import { resolveChatId } from "./lib/app-links"
import "./App.css"

/** Minimal history-aware pathname hook — enough for these routes, no router dep. */
function useLocation() {
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }))

  useEffect(() => {
    const onChange = () =>
      setLocation({
        pathname: window.location.pathname,
        search: window.location.search,
      })

    window.addEventListener("popstate", onChange)
    return () => window.removeEventListener("popstate", onChange)
  }, [])

  return location
}

/** Public pages linked from the Play listing and the site footer. */
const STATIC_PAGES: Record<string, () => React.ReactElement> = {
  "/privacy": PrivacyPage,
  "/terms": TermsPage,
  "/delete-account": DeleteAccountPage,
  "/support": SupportPage,
}

export default function App() {
  const { pathname, search } = useLocation()
  const path = pathname.replace(/\/+$/, "") || "/"

  const Page = STATIC_PAGES[path]
  if (Page) return <Page />

  const chatId = resolveChatId(pathname, search)
  if (chatId) {
    return <AgentRedirect agentId={chatId} />
  }

  return <LandingPage />
}
