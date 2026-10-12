import { Stack } from "expo-router";

/**
 * Nested navigator for onboarding. Giving the directory its own layout keeps
 * the flow a single screen in the root stack, so it can be guarded with one
 * `<Stack.Protected>` rather than listed step by step.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
