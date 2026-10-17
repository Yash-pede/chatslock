import type { ReactNode } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { spacing } from "../theme";
import { Text } from "./text";

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Controls on the right — search, edit, and so on. */
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The large screen heading used by the primary tabs.
 *
 * It sits below the status-bar inset, which the `Screen` frame applies, and
 * carries no background of its own so it reads as part of the page rather than
 * a separate bar.
 */
export function AppHeader({
  title,
  subtitle,
  actions,
  style,
  testID,
}: AppHeaderProps) {
  return (
    <View testID={testID} style={[styles.root, style]}>
      <View style={styles.titles}>
        <Text variant="title" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  titles: {
    flex: 1,
    gap: spacing.xxs,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
