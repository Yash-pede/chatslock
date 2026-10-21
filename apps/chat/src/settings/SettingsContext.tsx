import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useTheme, type ThemeProviderProps } from "@repo/ui";

export type ThemePreference = "light" | "dark" | "system";

/** Device-local preferences. Notification flags are stored now and honoured once push lands. */
export interface AppSettings {
    theme: ThemePreference;
    messageNotifications: boolean;
    notificationSound: boolean;
    messagePreview: boolean;
    readReceipts: boolean;
    mediaAutoDownload: boolean;
}

const STORAGE_KEY = "app-settings";

const DEFAULTS: AppSettings = {
    theme: "system",
    messageNotifications: true,
    notificationSound: true,
    messagePreview: true,
    readReceipts: true,
    mediaAutoDownload: true,
};

interface SettingsContextValue {
    settings: AppSettings;
    /** False until the stored values have been read, so the UI never flashes defaults. */
    isHydrated: boolean;
    setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
    settings: DEFAULTS,
    isHydrated: false,
    setSetting: () => {},
});

export function useSettings() {
    return useContext(SettingsContext);
}

function parseStored(raw: string | null): AppSettings {
    if (!raw) return DEFAULTS;

    try {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        // Merge over defaults so a newly added key always has a value.
        return {...DEFAULTS, ...parsed};
    } catch {
        return DEFAULTS;
    }
}

/**
 * Owns persisted app preferences and keeps the AniUI/uniwind theme in sync with
 * the stored choice. Wrap inside `ThemeProvider` so `useTheme` is available.
 */
export function SettingsProvider({ children }: Pick<ThemeProviderProps, "children">) {
    const { setTheme } = useTheme();
    const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        let cancelled = false;

        void SecureStore.getItemAsync(STORAGE_KEY)
            .then((raw) => {
                if (cancelled) return;
                const stored = parseStored(raw);
                setSettings(stored);
                setTheme(stored.theme);
            })
            .finally(() => {
                if (!cancelled) setIsHydrated(true);
            });

        return () => {
            cancelled = true;
        };
    }, [setTheme]);

    const setSetting = useCallback<SettingsContextValue["setSetting"]>(
        (key, value) => {
            setSettings((current) => {
                const next = {...current, [key]: value};
                void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
                if (key === "theme") setTheme(value as ThemePreference);
                return next;
            });
        },
        [setTheme],
    );

    const value = useMemo(
        () => ({settings, isHydrated, setSetting}),
        [settings, isHydrated, setSetting],
    );

    return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
