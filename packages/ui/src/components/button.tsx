import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { radius, sizing, spacing, useTheme } from "../theme";
import { Icon, isIconName, type IconName } from "./icon";
import { Text } from "./text";

/**
 * `outline` is the sibling of `primary`, not a lighter `secondary`: it draws a
 * hairline and leaves the surface showing, which is what a sign-in method the
 * user did *not* choose by default should look like.
 */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Shown instead of `label` while `loading` is true. */
  loadingLabel?: string;
  /**
   * A glyph leading the label.
   *
   * Takes a name or a node. A name is the common case — `icon="phone"` — and
   * resolves to an `<Icon>` tinted to the button's own foreground, so the
   * variant cannot end up with a mismatched icon. Pass a node only when the
   * icon is already built or is not an icon at all.
   */
  icon?: IconName | ReactNode;
  /** Stretch to the width of the column. The default for a stacked form. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  disabled = false,
  loading = false,
  loadingLabel,
  icon,
  block = false,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const inert = disabled || loading;

  // `ghost` paints nothing and `outline` paints only a hairline; the other two
  // are the filled shadcn variants.
  const background =
    variant === "primary"
      ? colors.primary
      : variant === "secondary"
        ? colors.secondary
        : "transparent";
  const foreground =
    variant === "primary"
      ? colors.primaryForeground
      : variant === "secondary"
        ? colors.secondaryForeground
        : variant === "outline"
          ? colors.foreground
          : colors.primary;

  // The icon is dropped while loading: a spinner already says "working", and
  // two indicators side by side reads as a glitch.
  const leading =
    !loading &&
    (isIconName(icon) ? (
      <Icon name={icon} size={sizing.iconSmall} color={foreground} />
    ) : (
      icon
    ));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      accessibilityHint={accessibilityHint}
      // A screen reader announces the button, not its label and icon as two
      // separate things, so the icon is hidden unless it is the only content.
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xxl,
          minHeight: sizing.hitSlop,
        },
        // `block` beats the parent row rather than the variant's own width, so
        // a full-width button stays full width whatever its variant.
        block && styles.block,
        size === "md" && {
          paddingVertical: spacing.sm,
        },
        variant === "ghost" && { paddingHorizontal: spacing.md },
        variant === "outline" && [
          { borderColor: colors.border },
          styles.outline,
          // Outline has no fill to dim, so the press state shows as a surface
          // tint instead of an opacity change.
          pressed && { backgroundColor: colors.accent },
        ],
        // Press feedback lives here, not in the base style — a filled button
        // dims under the press the way `active:bg-primary/90` does in shadcn.
        pressed && variant === "primary" && { opacity: 0.85 },
        pressed &&
          (variant === "secondary" || variant === "ghost") && {
            opacity: 0.7,
          },
        inert && styles.inert,
        style,
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}

      {loading ? (
        <>
          <ActivityIndicator color={foreground} size="small" />
          {loadingLabel ? (
            <Text
              variant="headline"
              style={{ color: foreground, marginLeft: spacing.sm }}
            >
              {loadingLabel}
            </Text>
          ) : null}
        </>
      ) : (
        <Text variant="headline" style={{ color: foreground }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  block: {
    width: "100%",
  },
  outline: {
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  leading: {
    marginRight: spacing.sm,
  },
  inert: {
    opacity: 0.5,
  },
});
