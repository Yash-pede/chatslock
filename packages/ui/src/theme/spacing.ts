/**
 * Design tokens: spacing.
 *
 * Derived from the shadcn `--spacing: 0.25rem` token — one base unit of 4px, the
 * same value Tailwind's `p-1` resolves to. Every step below is that unit
 * multiplied, so the scale is identical to Tailwind's and a ported shadcn
 * component lands on the same pixels.
 */

/** The base unit. One Tailwind step, one rem at a 16px root. */
export const BASE_UNIT = 4;

/**
 * The named scale.
 *
 * Named by size rather than by use, matching shadcn/Tailwind convention: a
 * component picks a step, never a raw number. If a layout needs a value between
 * two steps, use the nearest one or reach for `space()`.
 */
export const spacing = {
  none: 0,
  /** 2px — hairline nudges between an icon and its optical centre. */
  xxs: BASE_UNIT * 0.5,
  /** 4px — `p-1`. Tight stacks, icon-to-label gaps. */
  xs: BASE_UNIT,
  /** 8px — `p-2`. Default gap inside a control. */
  sm: BASE_UNIT * 2,
  /** 12px — `p-3`. Default control padding. */
  md: BASE_UNIT * 3,
  /** 16px — `p-4`. Screen gutter, block separation. */
  lg: BASE_UNIT * 4,
  /** 20px — `p-5`. Header vertical rhythm. */
  xl: BASE_UNIT * 5,
  /** 24px — `p-6`. Between major blocks. */
  xxl: BASE_UNIT * 6,
  /** 32px — `p-8`. Empty-state breathing room. */
  xxxl: BASE_UNIT * 8,
} as const;

/**
 * The spacing scale as an array of Tailwind-equivalent steps.
 *
 * Useful for loops, and for porting a component that indexes the scale by number
 * (`gap-3` → `spacingScale[3]`).
 */
export const spacingScale = [
  0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64,
] as const;

/**
 * An arbitrary multiple of the base unit — the RN equivalent of Tailwind's
 * arbitrary values.
 *
 * Accepts a step (`space(3)` → 12) or, handed a string, a literal override
 * (`space("10px")` → 10). Prefer the named scale; this exists for the cases
 * where a ported component needs a value the scale does not have.
 */
export function space(step: number | string): number {
  if (typeof step === "string") return Number.parseFloat(step);
  return step * BASE_UNIT;
}

export type SpacingToken = keyof typeof spacing;
