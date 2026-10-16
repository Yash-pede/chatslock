import { Screen, Text } from "@repo/ui";
import { useEffect, useState } from "react";
import { takePendingChatId } from "@/utils/pendingChat";

/**
 * Where the flow lands once auth is done.
 *
 * A placeholder on purpose: this build ships the sign-in screens only, and
 * anything more here would be a chat screen nobody has designed yet. When a
 * share link brought a chat id along, it is surfaced here until then.
 */
export default function HomeScreen() {
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void takePendingChatId().then((chatId) => {
      if (!cancelled && chatId) {
        setPendingChatId(chatId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen testID="home">
      <Text variant="title">chatslock</Text>
      <Text variant="subhead" tone="secondary">
        {pendingChatId ? `Opening chat ${pendingChatId}…` : "You are in."}
      </Text>
    </Screen>
  );
}
