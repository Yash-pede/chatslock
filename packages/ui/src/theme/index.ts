/**
 * The single theme entry point for chatslock.
 *
 * Screens and components import from `@chatslock/ui/theme` only — never reach
 * into individual token files — so there is exactly one source of truth for
 * colour, spacing, radius, elevation and type.
 *
 * Token names follow shadcn's vocabulary where shadcn has one, so a shadcn
 * component ports across by renaming its imports rather than rewriting its
 * internals. Names marked as app extensions are the ones shadcn has no word for.
 */
export {
  spacing,
  spacingScale,
  space,
  BASE_UNIT,
  type SpacingToken,
} from "./spacing";
export { radius, radiusScale, RADIUS_BASE, type RadiusToken } from "./radius";
export {
  shadowsLight,
  shadowsDark,
  shadowStyle,
  type ShadowScale,
  type ShadowSize,
  type ShadowToken,
} from "./shadows";
export { type, type TypeVariant } from "./typography";
export { sizing } from "./layout";
export {
  ThemeProvider,
  useTheme,
  useThemeMode,
  lightTheme,
  darkTheme,
  avatarPalette,
  type Theme,
  type ThemeColors,
  type ThemeMode,
} from "./colors";
