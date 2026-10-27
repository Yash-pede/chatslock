import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import * as SecureStore from "expo-secure-store"
import { useTheme, type ThemeProviderProps } from "@repo/ui"

export type ThemePreference = "light" | "dark" | "system"

/** Device-local preferences. Notification flags are stored now and honoured once push lands. */
export interface AppSettings {
  theme: ThemePreference
  messageNotifications: boolean
  notificationSound: boolean
  messagePreview: boolean
  readReceipts: boolean
  mediaAutoDownload: boolean
}

const STORAGE_KEY = "app-settings"

const DEFAULTS: AppSettings = {
  theme: "system",
  messageNotifications: true,
  notificationSound: true,
  messagePreview: true,
  readReceipts: true,
  mediaAutoDownload: true,
}

type SettingsKey = keyof AppSettings

interface SettingsContextValue {
  settings: AppSettings
  setSetting: <K extends SettingsKey>(key: K, value: AppSettings[K]) => void
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULTS,
  setSetting: () => {},
})

export function useSettings() {
  return useContext(SettingsContext)
}

function parseStored(raw: string | null): AppSettings {
  if (!raw) return DEFAULTS

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    // Merge over defaults so a newly added key always has a value.
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

/**
 * Owns persisted app preferences and keeps the AniUI/uniwind theme in sync with
 * the stored choice. Wrap inside `ThemeProvider` so `useTheme` is available.
 */
export function SettingsProvider({ children }: Pick<ThemeProviderProps, "children">) {
  const { setTheme } = useTheme()
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)

  useEffect(() => {
    let cancelled = false

    void SecureStore.getItemAsync(STORAGE_KEY).then((raw) => {
      if (cancelled) return
      const stored = parseStored(raw)
      setSettings(stored)
      setTheme(stored.theme)
    })

    return () => {
      cancelled = true
    }
  }, [setTheme])

  const setSetting = useCallback<SettingsContextValue["setSetting"]>(
    (key, value) => {
      setSettings((current) => {
        const next = { ...current, [key]: value }
        void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next))
        if (key === "theme") setTheme(value as ThemePreference)
        return next
      })
    },
    [setTheme],
  )

  const value = useMemo(() => ({ settings, setSetting }), [settings, setSetting])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
