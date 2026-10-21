import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, useColorScheme as useNativeColorScheme, View } from "react-native";
import { Uniwind } from "uniwind";
import { cn } from "../lib/utils";

type Theme = "light" | "dark" | "system";

const ThemeContext = createContext<{
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  className?: string;
}

const applyTheme = (resolved: "light" | "dark") => {
  if (Uniwind?.setTheme) {
    Uniwind.setTheme(resolved);
  } else {
    try {
      Appearance.setColorScheme(resolved);
    } catch {}
  }
};

export function ThemeProvider({
  children,
  defaultTheme = "system",
  className,
}: ThemeProviderProps) {
  const systemScheme = useNativeColorScheme();
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemScheme === "dark" ? "dark" : "light") : theme;

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    const resolved = newTheme === "system" ? (systemScheme === "dark" ? "dark" : "light") : newTheme;
    applyTheme(resolved);
  }, [systemScheme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const current = prev === "system" ? (systemScheme === "dark" ? "dark" : "light") : prev;
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, [systemScheme]);

  useEffect(() => {
    if (defaultTheme !== "system") {
      applyTheme(defaultTheme === "dark" ? "dark" : "light");
    }
  }, [defaultTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      <View className={cn(resolvedTheme === "dark" ? "dark" : "", "flex-1 bg-background", className)}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export const THEME_COLORS = {
  light: { background: "#ffffff", foreground: "#09090b", card: "#ffffff", cardForeground: "#09090b", primary: "#2563eb", primaryForeground: "#f8fafc", secondary: "#f4f4f5", secondaryForeground: "#18181b", muted: "#f4f4f5", mutedForeground: "#71717a", accent: "#f4f4f5", accentForeground: "#18181b", destructive: "#ef4444", destructiveForeground: "#fafafa", border: "#e4e4e7", input: "#e4e4e7", ring: "#18181b" },
  dark: { background: "#09090b", foreground: "#fafafa", card: "#09090b", cardForeground: "#fafafa", primary: "#3b82f6", primaryForeground: "#0f172a", secondary: "#27272a", secondaryForeground: "#fafafa", muted: "#27272a", mutedForeground: "#a1a1aa", accent: "#27272a", accentForeground: "#fafafa", destructive: "#7f1d1d", destructiveForeground: "#fafafa", border: "#27272a", input: "#27272a", ring: "#d4d4d8" },
} as const;

export function useThemeColors() {
  const scheme = useNativeColorScheme();
  return scheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;
}
