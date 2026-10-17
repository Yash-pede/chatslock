import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, sizing, spacing, useTheme } from "../theme";
import { Text } from "./text";

export type BadgeVariant = "primary" | "muted";

export interface BadgeProps {
  count: number;
  /**
   * `primary` for an unread mention, `muted` for a plain unread count — the
   * same distinction the chat list draws.
   */
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The unread-count pill that sits at the trailing edge of a chat row. */
export function Badge({
  count,
  variant = "muted",
  style,
  testID,
}: BadgeProps) {
  const { colors } = useTheme();

  const background =
    variant === "primary" ? colors.primary : colors.countMuted;
  const color =
    variant === "primary" ? colors.primaryForeground : colors.mutedForeground;

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        { backgroundColor: background, borderRadius: radius.pill },
        style,
      ]}
    >
      <Text variant="tiny" style={{ color }}>
        {count > 99 ? "99+" : String(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minWidth: sizing.badge,
    height: sizing.badge,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
});
