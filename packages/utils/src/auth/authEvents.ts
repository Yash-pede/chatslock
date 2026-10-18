type LogoutListener = () => void;

/**
 * Tiny bus so the API layer can tell the UI "the session is gone" without the
 * two depending on each other. The axios interceptor emits; `AuthProvider`
 * subscribes and clears its state.
 */
class AuthEventBus {
    private listeners = new Set<LogoutListener>();

    onLogout(listener: LogoutListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    emitLogout(): void {
        this.listeners.forEach((listener) => listener());
    }
}

export const authEvents = new AuthEventBus();

/** True when an axios-style failure never reached the server. */
export function isNetworkError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const { isAxiosError, response } = error as {
        isAxiosError?: boolean;
        response?: unknown;
    };
    return isAxiosError === true && !response;
}
