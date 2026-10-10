/**
 * The API base URL is never hardcoded. The app reads `EXPO_PUBLIC_API_URL`
 * (Expo inlines `EXPO_PUBLIC_*` into the app bundle) and hands it here once at
 * startup via `configureApi`. `readEnv` is only a fallback for environments
 * where that inlining reaches this package too.
 */
let configuredBaseUrl: string | null = null;

function readEnv(key: string): string | undefined {
    try {
        const env = (
            globalThis as {
                process?: { env?: Record<string, string | undefined> };
            }
        ).process?.env;
        return env?.[key];
    } catch {
        return undefined;
    }
}

function normalize(url: string): string {
    return url.replace(/\/+$/, "");
}

/** Set the API base URL. Call once at app startup. */
export function configureApi(baseUrl: string | undefined | null): void {
    if (!baseUrl) return;
    configuredBaseUrl = normalize(baseUrl);
}

export function getApiBaseUrl(): string {
    const url = configuredBaseUrl ?? readEnv("EXPO_PUBLIC_API_URL");
    if (!url) {
        throw new Error(
            "API base URL is not set. Define EXPO_PUBLIC_API_URL in .env or call configureApi().",
        );
    }
    return normalize(url);
}

/** The auth microservice root — every endpoint hangs off this. */
export function getAuthApiUrl(): string {
    return `${getApiBaseUrl()}/api/auth`;
}
