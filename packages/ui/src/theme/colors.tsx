/**
 * Design tokens: colors.
 *
 * Structured as **shadcn tokens** — `background`, `foreground`, `primary`,
 * `muted`, `border`, `destructive` and so on — so a shadcn component ports into
 * this app by renaming its imports rather than rewriting its internals.
 *
 * On compatibility, since this is React Native and not a Tailwind app:
 *
 * - CSS custom properties (`var(--x)`) and `@theme inline` do **not** carry
 *   over. React Native's `StyleSheet` has no CSS variable resolver, so every
 *   token here is a plain TypeScript value.
 * - `oklch()` does **not** carry over either — RN has no CSS colour-function
 *   parser. It accepts hex, `rgb()/rgba()`, `hsl()/hsla()` and named colours,
 *   which is all this file needs.
 * - `@layer base` has nothing to apply to without Tailwind. The equivalent job
 *   is done by `<ThemeProvider>`, which resolves one palette for the whole tree
 *   instead of letting every component subscribe to the colour scheme.
 *
 * The light/dark split is declared the way shadcn does it (`:root` and
 * `.dark`), as two literal objects here rather than as CSS blocks. Values are
 * kept in the hex form the original tokens use so they stay copy-pasteable.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

import { shadowsDark, shadowsLight, type ShadowScale } from "./shadows";

/**
 * The light palette.
 *
 * The first block is shadcn's canonical token set, verbatim. Anything below the
 * `app extensions` comment is an addition: shadcn has no vocabulary for message
 * bubbles or chat chrome, and giving those shadcn names would make the
 * extension look canonical.
 */
const lightPalette = {
  // --- shadcn canonical ------------------------------------------------
  /** App background. */
  background: "#fdfdff",
  /** Primary text. */
  foreground: "#0d0d12",
  /** Raised surface: headers, cards, the composer. */
  card: "#ffffff",
  cardForeground: "#0d0d12",
  /** Menus, sheets and anything that floats above a card. */
  popover: "#ffffff",
  popoverForeground: "#0d0d12",
  /** The brand action colour — send button, links, active tab. */
  primary: "#0f62fe",
  primaryForeground: "#f3f4f6",
  /** Tinted supporting surface. */
  secondary: "#edebff",
  secondaryForeground: "#483d8b",
  /** Recessed surface: the search pill, the composer input. */
  muted: "#f1f1f8",
  /** Secondary label text. */
  mutedForeground: "#62627a",
  /** Lowest-emphasis text: placeholders, timestamps, disabled labels. */
  faintForeground: "#8b8ba3",
  /** Low-emphasis hover/press surface. */
  accent: "#f0f2ff",
  accentForeground: "#6b46ff",
  /** Destructive actions. */
  destructive: "#ef4444",
  destructiveForeground: "#f8fafc",
  /** Hairlines and separators. */
  border: "#e2e2ee",
  /** Input borders. */
  input: "#e2e2ee",
  /** Focus ring. */
  ring: "#0f62fe",

  // --- app extensions ---------------------------------------------------
  /** The tinted area behind message bubbles. */
  canvas: "#eef0fb",
  /** A separator that needs more presence than `border`. */
  separatorStrong: "#d5d5e4",
  /** The count pill behind an inactive filter tab. */
  countMuted: "#e6e6f0",
  /** Press feedback on a row. */
  pressed: "rgba(13, 13, 18, 0.05)",

  /** Incoming bubble. */
  bubbleIn: "#ffffff",
  /** Incoming bubble outline. */
  bubbleInBorder: "#e4e4ef",
  /** Outgoing bubble. */
  bubbleOut: "#e7ffd8",
  bubbleOutBorder: "#cdf0b0",
  /** Timestamp inside an outgoing bubble. */
  bubbleOutMeta: "#3f8f4a",
  /** "online" and other positive status text. */
  online: "#12a150",
  /** Translucent pill behind a date divider. */
  datePill: "rgba(13, 13, 18, 0.42)",
  /** The ring around an unseen story. */
  storyRing: "#0f62fe",
} as const;

/** The dark palette. Same token names, same order. */
const darkPalette = {
  // --- shadcn canonical ------------------------------------------------
  background: "#0a0a0c",
  foreground: "#f8f8fc",
  card: "#121216",
  cardForeground: "#f8f8fc",
  popover: "#121216",
  popoverForeground: "#f8f8fc",
  primary: "#8c71ff",
  primaryForeground: "#ffffff",
  secondary: "#1e1b3a",
  secondaryForeground: "#d4ccff",
  muted: "#1a1a24",
  mutedForeground: "#a1a1b5",
  faintForeground: "#70707f",
  accent: "#252445",
  accentForeground: "#c7b8ff",
  destructive: "#7f1d1d",
  destructiveForeground: "#f8fafc",
  border: "#2a2a35",
  input: "#2a2a35",
  ring: "#8c71ff",

  // --- app extensions ---------------------------------------------------
  canvas: "#0e0e13",
  separatorStrong: "#3a3a48",
  countMuted: "#2a2a38",
  pressed: "rgba(248, 248, 252, 0.08)",

  bubbleIn: "#191922",
  bubbleInBorder: "#26262f",
  bubbleOut: "#1c2b1a",
  bubbleOutBorder: "#274024",
  bubbleOutMeta: "#7fb87f",
  online: "#3ddc84",
  datePill: "rgba(0, 0, 0, 0.55)",
  storyRing: "#8c71ff",
} as const;

/**
 * Stable per-contact avatar tints.
 *
 * Initials carry the identity when there is no avatar image, so the tint is
 * derived from the name — otherwise every row renders the same grey circle.
 */
export const avatarPalette = [
  "#e17076",
  "#7bc862",
  "#65aadd",
  "#a695e7",
  "#ee7aae",
  "#f6a441",
  "#42b8a6",
  "#5b8def",
] as const;

export type ThemeColors = {
  readonly [K in keyof typeof lightPalette]: string;
};

export type Theme = {
  readonly dark: boolean;
  readonly colors: ThemeColors;
  /**
   * The shadow scale for this scheme.
   *
   * Carried on the theme rather than exported separately so a component reads
   * colours and shadows from one `useTheme()` call, and so a dark theme can
   * never end up pairing dark colours with the light scale's shadows.
   */
  readonly shadows: ShadowScale;
};

export const lightTheme: Theme = {
  dark: false,
  colors: lightPalette,
  shadows: shadowsLight,
};

export const darkTheme: Theme = {
  dark: true,
  colors: darkPalette,
  shadows: shadowsDark,
};

/** Which palette to use. `system` follows the OS setting. */
export type ThemeMode = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "chatslock:theme-mode";

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "system" || value === "light" || value === "dark";

type ThemeContextValue = {
  theme: Theme;
  /** The active preference — what the user chose, not what resolved. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Cycles system → light → dark → system. For a single-button control. */
  cycleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: "system",
  setMode: () => {},
  cycleMode: () => {},
});

/**
 * Resolves the active theme for the whole tree.
 *
 * This is the React Native equivalent of shadcn's `.dark` class: rather than a
 * CSS cascade deciding which value wins, one provider picks a palette and every
 * component reads from it. Without it, every `useTheme()` call would subscribe
 * to `useColorScheme()` separately — one OS subscription per row on a long chat
 * list.
 *
 * The user's choice is persisted, because a theme switcher that forgets on every
 * cold start is worse than none. The stored value is applied *after* the first
 * paint rather than read synchronously: AsyncStorage is async, and blocking the
 * first render on it would delay startup to avoid a flash of the wrong theme.
 * Until it resolves the app follows the OS, which is what the user most likely
 * wants anyway.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isThemeMode(stored)) setModeState(stored);
      })
      .catch(() => {
        // A missing or unreadable preference just means "follow the system".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {
      // Persisting is best-effort; the in-memory choice still applies.
    });
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((current) => {
      const next: ThemeMode =
        current === "system"
          ? "light"
          : current === "light"
            ? "dark"
            : "system";
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    // `system` defers to the OS; an explicit choice overrides it either way, so
    // choosing "light" on a dark phone stays light.
    const resolved = mode === "system" ? systemScheme : mode;
    return {
      theme: resolved === "dark" ? darkTheme : lightTheme,
      mode,
      setMode,
      cycleMode,
    };
  }, [mode, systemScheme, setMode, cycleMode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** The active theme: the resolved palette plus its shadow scale. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/**
 * The theme preference, for controls that need to show or change it.
 *
 * Separate from `useTheme()` because most components only need the palette —
 * subscribing them to the preference would re-render every one of them on a
 * switch for no reason.
 */
export function useThemeMode(): Omit<ThemeContextValue, "theme"> {
  const { mode, setMode, cycleMode } = useContext(ThemeContext);
  return useMemo(
    () => ({ mode, setMode, cycleMode }),
    [mode, setMode, cycleMode],
  );
}
