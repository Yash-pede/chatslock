import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/utils/AuthContext";
import { rememberPendingChatId } from "@/utils/pendingChat";

/** expo-router can hand over arrays; take the first value. */
function first(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Landing route for chat share links.
 *
 * Reached via the verified App Link / Universal Link
 * (https://chatslock.com/u/<id>) or the custom scheme (chatslock://u/<id>).
 * The id travels as a path parameter; `?c=<id>` is accepted as a fallback.
 *
 * The id is stored, then the user is sent on: straight home when signed in,
 * through the auth flow when not. Home consumes the stored id and opens the
 * conversation.
 */
export default function ChatLinkScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    c?: string | string[];
  }>();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const chatId = first(params.id) ?? first(params.c) ?? null;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    let cancelled = false;

    void (async () => {
      if (chatId) {
        await rememberPendingChatId(chatId);
      }

      if (!cancelled) {
        router.replace(isAuthenticated ? "/" : "/auth");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, isAuthenticated, isLoading, router]);

  return null;
}
