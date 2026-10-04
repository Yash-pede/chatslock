/**
 * The icon primitive.
 *
 * Icons are drawn here rather than pulled from a font or a DOM library, because
 * this package has to render the same way on iOS, Android and web. `Svg` from
 * `react-native-svg` is the one renderer that works on all three, and a
 * hand-written path costs nothing at runtime — there is no atlas to load, no
 * font to wait for, and no FOUT on the first screen.
 *
 * Every glyph is stroked on a 24×24 grid with a 2pt stroke, so mixing them in a
 * row needs no per-icon nudging: they share an optical weight and a cap style by
 * construction. Stroke width is left in grid units rather than divided by size
 * so the weight scales with the icon instead of thinning out as it grows.
 *
 * The set is deliberately small. Each entry here is a maintenance promise, so
 * this only grows when a screen needs a glyph — not because a library happened
 * to ship one.
 */
import Svg, { Path } from "react-native-svg";

import { sizing, useTheme } from "../theme";

/** A glyph on the 24×24 grid: one entry per path, drawn in stroke. */
type Glyph = readonly string[];

/**
 * The grid every glyph is authored against.
 *
 * Fixed rather than derived from `size`, so a path written once looks correct
 * at every size it is rendered at.
 */
const VIEW_BOX = 24;

/** Stroke weight in grid units. */
const STROKE_WIDTH = 2;

const glyphs = {
  /** A handset — the phone-number sign-in method. */
  phone: [
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z",
  ],
  /** A key on a ring — the username-and-password method. */
  keys: [
    "M7.5 10 A5.5 5.5 0 1 0 7.5 21 A5.5 5.5 0 1 0 7.5 10",
    "m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4",
  ],
  /** A shield — what the account is protected with. */
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
} as const satisfies Record<string, Glyph>;

/**
 * Names this package draws.
 *
 * `privacy` is a synonym for `shield` rather than a second glyph: screens talk
 * about what a thing is *for*, and the drawing is a shield either way. Two
 * names for one glyph is cheaper than making every call site remember which
 * noun the artist happened to pick.
 */
export type IconName = keyof typeof glyphs | "privacy";

/**
 * Whether a string names a glyph this package draws.
 *
 * Needed because `ReactNode` already includes `string`, so a component taking
 * `IconName | ReactNode` cannot narrow on `typeof x === "string"` alone — the
 * check has to be membership, not type.
 */
export function isIconName(value: unknown): value is IconName {
  return (
    typeof value === "string" &&
    (value === "privacy" || Object.hasOwn(glyphs, value))
  );
}

export interface IconProps {
  name: IconName;
  /** Rendered size in points. Reads `sizing.icon` by default. */
  size?: number;
  /** Defaults to the theme's foreground. */
  color?: string;
  /**
   * Set when the icon carries meaning a screen reader has to announce.
   *
   * Left unset, the icon is hidden from the accessibility tree: an icon that
   * only repeats the label next to it is noise to anyone listening.
   */
  accessibilityLabel?: string;
  testID?: string;
}

export function Icon({
  name,
  size = sizing.icon,
  color,
  accessibilityLabel,
  testID,
}: IconProps) {
  const { colors } = useTheme();
  // `name` is typed, so this is unreachable from TypeScript — but an icon is
  // decorative by nature and a missing glyph must not take a screen down with
  // it. An unknown name renders nothing instead of throwing.
  const paths: Glyph | undefined =
    name === "privacy" ? glyphs.shield : glyphs[name];

  if (!paths) return null;

  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      fill="none"
      // Decorative unless the caller says the icon means something on its own.
      // `undefined` rather than `false` on purpose: react-native-svg forwards
      // this straight to the DOM on web, where React rejects a non-boolean.
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel !== undefined ? true : undefined}
    >
      {paths.map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color ?? colors.foreground}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
