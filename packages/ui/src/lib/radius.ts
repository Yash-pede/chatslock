/**
 * Corner radius for AniUI primitives. Every component's base shape comes from
 * here so the whole UI can be re-rounded in one place (and a caller can still
 * override a single component with a `rounded-*` class).
 */
export const radius = {
  /** Buttons, inputs, OTP boxes — the control surface. */
  control: "rounded-xl",
  /** Panels, alerts, cards. */
  surface: "rounded-xl",
  /** Icon tiles and the brand mark. */
  tile: "rounded-xl",
} as const;
