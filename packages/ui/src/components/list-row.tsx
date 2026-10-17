import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { sizing, spacing, useTheme } from "../theme";
import { Icon, type IconName } from "./icon";
import { Text } from "./text";

/** Where a row's text starts: gutter + icon column + gap. */
const TEXT_INSET = spacing.lg + sizing.icon + spacing.md;

export interface ListRowProps {
  label: string;
  description?: string;
  icon?: IconName;
  /** A trailing value, e.g. the current theme mode. */
  value?: string;
  /** Arbitrary trailing content — a switch, a badge. Takes the `value` slot. */
  right?: ReactNode;
  onPress?: () => void;
  /**
   * Draw the row's chevron.
   *
   * Defaults to on for pressable rows and off for static ones, so a row that
   * navigates always signals it and a detail row never pretends to.
   */
  chevron?: boolean;
  /** Paints the label and icon in the destructive colour. */
  destructive?: boolean;
  /** Overridden by `ListSection`, which hides the last row's divider. */
  showDivider?: boolean;
  testID?: string;
}

/**
 * One line in a settings or detail list.
 *
 * The row owns its height, gutter, icon column and divider so the lists that
 * compose it stay a flat array of data rather than a nest of styled views.
 */
export function ListRow({
  label,
  description,
  icon,
  value,
  right,
  onPress,
  chevron,
  destructive = false,
  showDivider = true,
  testID,
}: ListRowProps) {
  const { colors } = useTheme();

  const iconColor = destructive ? colors.destructive : colors.mutedForeground;
  const showChevron = chevron ?? Boolean(onPress);

  const content = (
    <View style={styles.row}>
      {icon ? (
        <Icon name={icon} size={sizing.icon} color={iconColor} />
      ) : null}

      <View style={styles.text}>
        <Text
          variant="body"
          numberOfLines={1}
          style={destructive ? { color: colors.destructive } : undefined}
        >
          {label}
        </Text>
        {description ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text variant="body" tone="tertiary" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right}

      {showChevron ? (
        <Icon
          name="chevronRight"
          size={sizing.iconSmall}
          color={colors.faintForeground}
        />
      ) : null}

      {showDivider ? (
        <View
          style={[
            styles.divider,
            {
              backgroundColor: colors.border,
              left: icon ? TEXT_INSET : spacing.lg,
            },
          ]}
        />
      ) : null}
    </View>
  );

  if (!onPress) {
    return testID ? <View testID={testID}>{content}</View> : content;
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && { backgroundColor: colors.pressed }}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: sizing.hitSlop,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  divider: {
    position: "absolute",
    right: spacing.lg,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});
