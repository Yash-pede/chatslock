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
import {getMe} from '@/api/users';
import type {User} from '@repo/api/types';

export interface OtpParams {
    otp: string;
    username: string;
    session: string;
}

export interface AuthContextValue {
    isAuthenticated: boolean;
    /** True once the user has a username and full name in the database. */
    isOnboarded: boolean;
    isLoading: boolean;
    user: AuthUser | null;
    /** The signed-in user's database row (null while signed out or loading). */
    profile: User | null;
    error: string | null;
    /** Step 1 of phone sign-in — sends the code, returns the challenge. */
    requestOtp: (phone: string) => Promise<OtpChallenge>;
    /** Step 2 — exchanges the code for tokens. */
    verifyOtp: (params: OtpParams) => Promise<void>;
    /** Username + password sign-in. */
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    /** Re-reads the profile, e.g. after finishing onboarding. */
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({children}: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isOnboarded, setIsOnboarded] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [profile, setProfile] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);

    /**
     * Whether onboarding is complete is a database fact, not a token fact — a
     * signed-in user can still be missing a row (or a username/name), and must
     * be sent through onboarding before the app is usable.
     */
    const loadProfile = useCallback(async () => {
        try {
            // null means the API answered NOT_FOUND — no row in the users table.
            const current = await getMe<User>();
            setProfile(current);
            setIsOnboarded(Boolean(current?.username && current?.fullName));
        } catch {
            setProfile(null);
            setIsOnboarded(false);
        }
    }, []);

    const applySession = useCallback(async () => {
        setUser(tokenManager.getUser());
        setIsAuthenticated(true);
        tokenRefreshService.startAutoRefresh();
        await loadProfile();
    }, [loadProfile]);

    const clearSession = useCallback(() => {
        tokenRefreshService.stopAutoRefresh();
        setUser(null);
        setProfile(null);
        setIsAuthenticated(false);
        setIsOnboarded(false);
    }, []);

    useEffect(() => {
        let active = true;

        void (async () => {
            const state = await silentAuthService.attemptSilentAuth();
            if (!active) return;
            setUser(state.user);
            setIsAuthenticated(state.isAuthenticated);
            if (state.isAuthenticated) {
                await loadProfile();
                if (!active) return;
            }
            setIsLoading(false);
        })();

        // The API layer emits this when a refresh fails for good.
        const unsubscribe = authEvents.onLogout(() => clearSession());

        return () => {
            active = false;
            unsubscribe();
        };
    }, [clearSession, loadProfile]);

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
                await applySession();
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
                await loginRequest({username, password});
                await applySession();
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
                isOnboarded,
                isLoading,
                user,
                profile,
                error,
                requestOtp,
                verifyOtp,
                login,
                logout,
                refreshProfile: loadProfile,
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

/**
 * The signed-in user's database row, available anywhere in the app.
 * Null while signed out or before the profile has loaded.
 */
export function useCurrentUser(): User | null {
    return useAuth().profile;
}
