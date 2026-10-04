/**
 * Design tokens: typography.
 *
 * Sizes mirror the platform text ramp, so the app feels native on each OS
 * while staying consistent between the two builds. `color` is deliberately absent — colour is resolved per theme at render
 * time by `<Text tone>` rather than baked in here.
 */
import type { TextStyle } from "react-native";

export const type = {
  /** Screen title — the large "Chats" heading. */
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  /** Header/nav bar title, conversation name. */
  header: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  /** Conversation row title, filter tab label. */
  headline: { fontSize: 16, lineHeight: 21, fontWeight: "600" },
  /** Message body, composer placeholder. */
  body: { fontSize: 16, lineHeight: 21, fontWeight: "400" },
  /** Preview line under a conversation title. */
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  /** Timestamps, subtitles, story names. */
  caption: { fontSize: 13, lineHeight: 17, fontWeight: "400" },
  /** Timestamp drawn inside a message bubble. */
  tiny: { fontSize: 12, lineHeight: 15, fontWeight: "400" },
  /** Bottom tab-bar label. */
  label: { fontSize: 11, lineHeight: 14, fontWeight: "500" },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
