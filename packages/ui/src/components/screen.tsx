import { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, useTheme } from "../theme";

export interface ScreenProps {
  children: ReactNode;
  /** Optional heading block pinned above the scrollable content. */
  header?: ReactNode;
  /** Pinned to the bottom, above the home indicator — e.g. a primary button. */
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Base screen frame: background colour, safe-area insets, keyboard avoidance and
 * optional scroll. Screens compose this instead of styling their own container.
 */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  padded = true,
  style,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const body = (
    <View
      style={[styles.body, padded && { padding: spacing.xl, gap: spacing.lg }]}
    >
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      testID={testID}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.root, { backgroundColor: colors.background }, style]}
    >
      {header ? (
        <View style={{ paddingTop: insets.top }}>{header}</View>
      ) : (
        <View style={{ height: insets.top }} />
      )}

      {scroll ? (
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}

      <View
        style={[
          styles.footer,
          padded && { paddingHorizontal: spacing.xl },
          { paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}
      >
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  body: {
    flexGrow: 1,
  },
  footer: {
    gap: spacing.sm,
  },
});
