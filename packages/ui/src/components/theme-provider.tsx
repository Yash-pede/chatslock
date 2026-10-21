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
  light: { background: "#f8fafc", foreground: "#0f172a", card: "#ffffff", cardForeground: "#0f172a", primary: "#2563eb", primaryForeground: "#f8fafc", secondary: "#eef2f6", secondaryForeground: "#0f172a", muted: "#eef2f6", mutedForeground: "#64748b", accent: "#e0edff", accentForeground: "#1d4ed8", destructive: "#ef4444", destructiveForeground: "#fafafa", border: "#dbe2ea", input: "#dbe2ea", ring: "#2563eb" },
  dark: { background: "#090f1b", foreground: "#f8fafc", card: "#101a2b", cardForeground: "#f8fafc", primary: "#3b82f6", primaryForeground: "#0f172a", secondary: "#1e293b", secondaryForeground: "#f8fafc", muted: "#1e293b", mutedForeground: "#94a3b8", accent: "#243449", accentForeground: "#f8fafc", destructive: "#dc2626", destructiveForeground: "#fafafa", border: "#27364d", input: "#27364d", ring: "#60a5fa" },
} as const;

export function useThemeColors() {
  const scheme = useNativeColorScheme();
  return scheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;
}
