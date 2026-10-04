import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, useTheme } from "../theme";
import { Text } from "./text";

export type AuthShellProps = {
  title: string;
  subtitle?: string;
  /** The fields and the primary action. */
  children: ReactNode;
  /** Secondary links below the action — switching method, resending a code. */
  footer?: ReactNode;
};

/**
 * The frame every sign-in screen sits in.
 *
 * One component rather than three near-identical screens, because the frame is
 * what makes the flow read as one place: the same centred card, the same
 * rhythm between the heading and the first field, the same distance from the
 * home indicator.
 *
 * `KeyboardAvoidingView` is enough here even though the composer needs the
 * animated keyboard: this is not a bottom-pinned bar. The card is centred in
 * the window, so lifting it by the overlap keeps it in view without any of the
 * edge-to-edge clipping a pinned bar suffers.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        // A short form rarely needs to scroll, but a small phone plus the
        // keyboard can push the action button under the IME — and scrolling is
        // better than a button the user cannot reach.
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: insets.bottom + spacing.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text variant="title">{title}</Text>
          {subtitle ? (
            <Text variant="subhead" tone="secondary" style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}

          <View style={styles.body}>{children}</View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: spacing.xs,
  },
  subtitle: {
    marginTop: spacing.xxs,
  },
  body: {
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
});
