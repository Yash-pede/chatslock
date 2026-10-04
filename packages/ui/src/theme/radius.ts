/**
 * Design tokens: corner radii.
 *
 * Derived from the shadcn `--radius: 1.4rem` token. shadcn defines its scale as
 * offsets from that base — `sm` is 4px under it, `xl` is 4px over — and that
 * relationship is preserved here so a ported component's corners match.
 *
 * `1rem` is 16px at a standard root, so the base is 22.4px.
 */

/** `--radius: 1.4rem` → 22.4px. */
export const RADIUS_BASE = 22.4;

/**
 * The named scale.
 *
 * `sm`/`md`/`lg`/`xl` are shadcn's. `bubble`, `tail` and `pill` are app
 * additions: a message bubble wants a deliberately squared corner for its tail,
 * and a pill has to be fully round — neither is expressible in shadcn's scale.
 */
export const radius = {
  none: 0,
  /** `--radius-sm` — `calc(var(--radius) - 4px)`. */
  sm: RADIUS_BASE - 4,
  /** `--radius-md` — `calc(var(--radius) - 2px)`. */
  md: RADIUS_BASE - 2,
  /** `--radius-lg` — `var(--radius)`. */
  lg: RADIUS_BASE,
  /** `--radius-xl` — `calc(var(--radius) + 4px)`. */
  xl: RADIUS_BASE + 4,

  // --- app extensions ---------------------------------------------------
  /** Message bubbles. Softer than `lg` so a long thread does not feel boxed in. */
  bubble: 18,
  /** The squared corner a bubble's tail grows from. */
  tail: 4,
  /** Fully rounded capsule: filter pills, count badges, the tab bar. */
  pill: 999,
} as const;

/**
 * The scale as an array, for components that index the scale rather than name a
 * step.
 */
export const radiusScale = [
  radius.sm,
  radius.md,
  radius.lg,
  radius.xl,
] as const;

export type RadiusToken = keyof typeof radius;
