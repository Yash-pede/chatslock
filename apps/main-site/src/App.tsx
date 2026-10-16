import { useEffect, useState } from "react";
import LandingPage from "./screens/LandingPage";
import AgentRedirect from "./screens/AgentRedirect";
import { resolveChatId } from "./lib/app-links";
import "./App.css";

/** Minimal history-aware pathname hook — enough for two routes, no router dep. */
function useLocation() {
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));

  useEffect(() => {
    const onChange = () =>
      setLocation({
        pathname: window.location.pathname,
        search: window.location.search,
      });

    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);

  return location;
}

export default function App() {
  const { pathname, search } = useLocation();
  const chatId = resolveChatId(pathname, search);

  if (chatId) {
    return <AgentRedirect agentId={chatId} />;
  }

  return <LandingPage />;
}
