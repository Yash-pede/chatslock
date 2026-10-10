import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import {
    authEvents,
    extractErrorMessage,
    login as loginRequest,
    logout as logoutRequest,
    requestOtp as requestOtpRequest,
    silentAuthService,
    tokenManager,
    tokenRefreshService,
    verifyOtp as verifyOtpRequest,
    type AuthUser,
    type OtpChallenge,
} from '@repo/utils/auth';

export interface OtpParams {
    otp: string;
    username: string;
    session: string;
}

export interface AuthContextValue {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: AuthUser | null;
    error: string | null;
    /** Step 1 of phone sign-in — sends the code, returns the challenge. */
    requestOtp: (phone: string) => Promise<OtpChallenge>;
    /** Step 2 — exchanges the code for tokens. */
    verifyOtp: (params: OtpParams) => Promise<void>;
    /** Username + password sign-in. */
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [error, setError] = useState<string | null>(null);

    const applySession = useCallback(() => {
        setUser(tokenManager.getUser());
        setIsAuthenticated(true);
        tokenRefreshService.startAutoRefresh();
    }, []);

    const clearSession = useCallback(() => {
        tokenRefreshService.stopAutoRefresh();
        setUser(null);
        setIsAuthenticated(false);
    }, []);

    useEffect(() => {
        let active = true;

        void (async () => {
            const state = await silentAuthService.attemptSilentAuth();
            if (!active) return;
            setUser(state.user);
            setIsAuthenticated(state.isAuthenticated);
            setIsLoading(false);
        })();

        // The API layer emits this when a refresh fails for good.
        const unsubscribe = authEvents.onLogout(() => clearSession());

        return () => {
            active = false;
            unsubscribe();
        };
    }, [clearSession]);

    const requestOtp = useCallback(async (phone: string) => {
        setError(null);
        try {
            return await requestOtpRequest(phone);
        } catch (e) {
            setError(extractErrorMessage(e));
            throw e;
        }
    }, []);

    const verifyOtp = useCallback(
        async (params: OtpParams) => {
            setError(null);
            try {
                await verifyOtpRequest(params);
                applySession();
            } catch (e) {
                setError(extractErrorMessage(e));
                throw e;
            }
        },
        [applySession],
    );

    const login = useCallback(
        async (username: string, password: string) => {
            setError(null);
            try {
                await loginRequest({ username, password });
                applySession();
            } catch (e) {
                setError(extractErrorMessage(e));
                throw e;
            }
        },
        [applySession],
    );

    const logout = useCallback(async () => {
        await logoutRequest();
        clearSession();
    }, [clearSession]);

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                isLoading,
                user,
                error,
                requestOtp,
                verifyOtp,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
