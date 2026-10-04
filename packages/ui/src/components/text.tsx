/**
 * The one text primitive.
 *
 * Every string on screen goes through here rather than RN's `Text`, so type size
 * and colour come from tokens instead of per-call-site inline styles. A screen
 * picks a `variant` (how loud the text is) and a `tone` (what it says about
 * importance); it never names a colour or a pixel size.
 *
 * `style` is applied last on purpose, so a caller can still override a single
 * property — an `Icon` sitting inside a button needs the button's foreground —
 * without giving up the variant.
 */
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from "react-native";

import {
  type as typeScale,
  useTheme,
  type ThemeColors,
  type TypeVariant,
} from "../theme";

/**
 * Emphasis, from loudest to quietest.
 *
 * Three steps is enough for this app: the thing you are meant to act on, the
 * context around it, and the metadata that is only read on purpose.
 */
export type TextTone = "primary" | "secondary" | "tertiary";

const TONE_COLOR = {
  primary: "foreground",
  secondary: "mutedForeground",
  tertiary: "faintForeground",
} as const satisfies Record<TextTone, keyof ThemeColors>;

export interface TextProps extends RNTextProps {
  /** Size and weight. `body` unless the text is the reason for the screen. */
  variant?: TypeVariant;
  /** Which palette entry the text is drawn in. */
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}

export function Text({
  variant = "body",
  tone = "primary",
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();

  return (
    <RNText
      {...rest}
      style={[typeScale[variant], { color: colors[TONE_COLOR[tone]] }, style]}
    />
  );
}
