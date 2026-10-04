/**
 * Design tokens: shadows.
 *
 * The shadcn `--shadow-*` scale, converted to the shape React Native actually
 * wants.
 *
 * CSS and RN disagree about what a shadow *is*. CSS `0px 4px 15px` means a blur
 * radius of 15; RN's `shadowRadius` is a different curve and needs roughly half
 * to match. On top of that, Android ignores `shadowColor` and `shadowOpacity`
 * entirely and draws a flat silhouette from `elevation`, which has no blur at
 * all. So every token below carries both descriptions of the same intent, and a
 * component spreading the result onto a plain `View` gets the right thing on
 * both platforms without branching.
 *
 * Pure data — no imports — so the theme module can own a scale without a cycle.
 */
import type { ViewStyle } from "react-native";

export type ShadowToken = {
  /** iOS and web. Spread straight onto a `View`'s style. */
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  /**
   * Half the CSS blur radius.
   *
   * RN's blur spreads roughly twice as far as CSS's for the same nominal
   * number, so matching appearance means halving it.
   */
  shadowRadius: number;
  /** Android. A flat silhouette; this platform has no blur. */
  elevation: number;
};

/**
 * Build one token.
 *
 * @param y         vertical offset, px — the CSS `Y`
 * @param blur      CSS blur radius, px — halved into `shadowRadius`
 * @param alpha     shadow opacity
 * @param elevation Android height, tuned to read similarly at that opacity
 */
function shadow(
  y: number,
  blur: number,
  alpha: number,
  elevation: number,
): ShadowToken {
  return {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: y },
    shadowOpacity: alpha,
    shadowRadius: blur / 2,
    elevation,
  };
}

/**
 * The light scale: short and tight.
 *
 * `sm` upward layers a second, much smaller shadow, as the CSS does — that inner
 * one is what keeps a card's edge crisp rather than uniformly hazy.
 */
export const shadowsLight = {
  "2xs": shadow(4, 15, 0.07, 1),
  xs: shadow(4, 15, 0.07, 1),
  sm: shadow(4, 15, 0.15, 2),
  DEFAULT: shadow(4, 15, 0.15, 3),
  md: shadow(4, 15, 0.15, 4),
  lg: shadow(4, 15, 0.15, 6),
  xl: shadow(4, 15, 0.15, 8),
  "2xl": shadow(4, 15, 0.38, 12),
} as const;

/**
 * The dark scale: longer and deeper.
 *
 * On a dark surface a 4px / 15% shadow is invisible, so the offset and blur grow
 * to carry the elevation the way they do in the original tokens.
 */
export const shadowsDark = {
  "2xs": shadow(10, 25, 0.07, 1),
  xs: shadow(10, 25, 0.07, 1),
  sm: shadow(10, 25, 0.15, 2),
  DEFAULT: shadow(10, 25, 0.15, 3),
  md: shadow(10, 25, 0.15, 4),
  lg: shadow(10, 25, 0.15, 6),
  xl: shadow(10, 25, 0.15, 8),
  "2xl": shadow(10, 25, 0.38, 12),
} as const;

export type ShadowScale = typeof shadowsLight;

export type ShadowSize = keyof ShadowScale;

/**
 * A token as a plain style fragment.
 *
 * Spread it into a `StyleSheet.create` entry, never inline into JSX — an inline
 * object literal is a new style object on every render, which React Native has
 * to re-diff.
 */
export function shadowStyle(token: ShadowToken): ViewStyle {
  return {
    shadowColor: token.shadowColor,
    shadowOffset: token.shadowOffset,
    shadowOpacity: token.shadowOpacity,
    shadowRadius: token.shadowRadius,
    elevation: token.elevation,
  };
}
