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
import type {User} from '@repo/types/schema';

export interface OtpParams {
    otp: string;
    username: string;
    session: string;
}

/** Where a signed-in session belongs. */
export type HomeRoute = '/onboarding' | '/';

export interface AuthContextValue {
    /** Signed in and the profile has been checked. */
    isAuthenticated: boolean;
    /** First launch only: the stored session is still being restored. */
    isLoading: boolean;
    /** The signed-in user decoded from the ID token. */
    user: AuthUser | null;
    /** The signed-in user's database row (null if the row doesn't exist yet). */
    profile: User | null;
    error: string | null;
    /** Step 1 of phone sign-in — sends the code, returns the challenge. */
    requestOtp: (phone: string) => Promise<OtpChallenge>;
    /** Step 2 — exchanges the code for tokens. Resolves to the route to open. */
    verifyOtp: (params: OtpParams) => Promise<HomeRoute>;
    /** Username + password sign-in. Resolves to the route to open. */
    login: (username: string, password: string) => Promise<HomeRoute>;
    logout: () => Promise<void>;
    /** Re-reads the profile after onboarding. */
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Agents are provisioned by an admin and never onboard. Everyone else needs a
 * username and full name on their row before the app is usable.
 */
function resolveHome(user: AuthUser | null, profile: User | null): HomeRoute {
    const isAgent = user?.groups.includes('agent') ?? false;
    const hasProfile = Boolean(profile?.username && profile?.fullName);
    return isAgent || hasProfile ? '/' : '/onboarding';
}

export function AuthProvider({children}: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [profile, setProfile] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchProfile = useCallback(async (): Promise<User | null> => {
        try {
            return await getMe<User>();
        } catch {
            return null;
        }
    }, []);

    const clearSession = useCallback(() => {
        tokenRefreshService.stopAutoRefresh();
        setUser(null);
        setProfile(null);
        setIsAuthenticated(false);
    }, []);

    /**
     * Restores a stored session on launch. Authentication is only published
     * once the profile is known, so the guards never see a half-signed-in state.
     */
    useEffect(() => {
        let active = true;

        void (async () => {
            const state = await silentAuthService.attemptSilentAuth();
            if (!active) return;
            setError(state.error);
            if (state.isAuthenticated) {
                const current = await fetchProfile();
                if (!active) return;
                setUser(state.user);
                setProfile(current);
                setIsAuthenticated(true);
            }
            setIsLoading(false);
        })();

        const unsubscribe = authEvents.onLogout(() => clearSession());

        return () => {
            active = false;
            unsubscribe();
        };
    }, [clearSession, fetchProfile]);

    /**
     * Turns fresh tokens into an app session: checks the profile first and only
     * then marks the user signed in, so the route guards never render against a
     * half-known state. The caller navigates to the returned route.
     */
    const signIn = useCallback(async () => {
        const user = tokenManager.getUser();
        const current = await fetchProfile();
        tokenRefreshService.startAutoRefresh();
        setUser(user);
        setProfile(current);
        setIsAuthenticated(true);
        return resolveHome(user, current);
    }, [fetchProfile]);

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
        async (params: OtpParams): Promise<HomeRoute> => {
            setError(null);
            try {
                await verifyOtpRequest(params);
                return await signIn();
            } catch (e) {
                setError(extractErrorMessage(e));
                throw e;
            }
        },
        [signIn],
    );

    const login = useCallback(
        async (username: string, password: string): Promise<HomeRoute> => {
            setError(null);
            try {
                await loginRequest({username, password});
                return await signIn();
            } catch (e) {
                setError(extractErrorMessage(e));
                throw e;
            }
        },
        [signIn],
    );

    const logout = useCallback(async () => {
        await logoutRequest();
        clearSession();
    }, [clearSession]);

    const refreshProfile = useCallback(async () => {
        const current = await fetchProfile();
        setProfile(current);
    }, [fetchProfile]);

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                isLoading,
                user,
                profile,
                error,
                requestOtp,
                verifyOtp,
                login,
                logout,
                refreshProfile,
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
export function useCurrentUser(): User {
    return useAuth().profile!;
}
