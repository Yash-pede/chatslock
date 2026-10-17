import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/utils/AuthContext";
import { rememberPendingAgentId } from "@/utils/pendingAgent";

/** expo-router can hand over arrays; take the first value. */
function first(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Landing route for agent links.
 *
 * Reached via the verified App Link / Universal Link
 * (https://chatslock.com/u/<agentId>) or the custom scheme
 * (chatslock://u/<agentId>). The agent id travels as a path parameter.
 *
 * The id is stored, then the user is sent on: straight home when signed in,
 * through the auth flow when not. A brand-new user keeps the id in storage and
 * onboarding sends it along, which opens the direct conversation with the agent.
 */
export default function ChatLinkScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const agentId = first(params.id) ?? null;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    let cancelled = false;

    void (async () => {
      if (agentId) {
        await rememberPendingAgentId(agentId);
      }

      if (!cancelled) {
        router.replace(isAuthenticated ? "/" : "/auth/phone");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId, isAuthenticated, isLoading, router]);

  return null;
}
