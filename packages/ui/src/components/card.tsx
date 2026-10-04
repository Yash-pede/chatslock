/**
 * A raised surface.
 *
 * The card is the app's one container for grouping related controls — a list
 * row's worth of detail, a form panel, a set of options. It exists so padding,
 * radius, border and elevation are decided in one place instead of at every
 * place a group of things needs a background.
 *
 * Deliberately not opinionated about what goes inside: it takes children and a
 * padding scale step, and nothing about the content.
 */
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import {
  radius,
  shadowStyle,
  spacing,
  useTheme,
  type SpacingToken,
} from "../theme";

export interface CardProps {
  children: ReactNode;
  /** Inner padding. `xl` for a standalone panel, `md` when nested in one. */
  padded?: SpacingToken;
  /**
   * Draw the border hairline.
   *
   * On by default: on a light scheme a card with only a shadow has no edge,
   * because the shadow is what the light scale is built to be least visible
   * at. Pass `false` when the card is already flush against a surface that
   * separates it.
   */
  bordered?: boolean;
  /** Drop the elevation. For a card on a surface that already reads as raised. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({
  children,
  padded = "xl",
  bordered = true,
  flat = false,
  style,
  testID,
}: CardProps) {
  const { colors, shadows } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          padding: spacing[padded],
        },
        bordered && {
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: colors.border,
        },
        // Shadow and border are alternatives, not companions, on a dark scheme:
        // the dark shadow scale is too soft to read as an edge once the
        // background is already darker than the surface.
        flat ? null : shadowStyle(shadows.DEFAULT),
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
  },
});
