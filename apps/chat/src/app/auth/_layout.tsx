import { Stack } from "expo-router";

/**
 * Nested navigator for the sign-in flow. Giving the `auth` directory its own
 * layout turns the whole flow into a single screen in the root stack, so the
 * root can guard it with one `<Stack.Protected>` instead of listing every step.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
