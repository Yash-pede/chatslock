import { Screen, Text } from "@chatslock/ui";

/**
 * Where the flow lands once auth is done.
 *
 * A placeholder on purpose: this build ships the sign-in screens only, and
 * anything more here would be a chat screen nobody has designed yet.
 */
export default function HomeScreen() {
  return (
    <Screen testID="home">
      <Text variant="title">chatslock</Text>
      <Text variant="subhead" tone="secondary">
        You are in.
      </Text>
    </Screen>
  );
}
