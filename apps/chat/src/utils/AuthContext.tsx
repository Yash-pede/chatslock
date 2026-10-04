import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    ReactNode,
} from 'react';
import { silentAuthService } from '@repo/utils/auth';
import { tokenManager } from '@repo/utils/auth';
import { tokenRefreshService } from '@repo/utils/auth';

interface UserProfile {
    id: string;
}

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: UserProfile | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<UserProfile | null>(null);

    useEffect(() => {
        initializeAuth();
    }, []);

    const initializeAuth = async () => {
        const authState = await silentAuthService.attemptSilentAuth();
        setIsAuthenticated(authState.isAuthenticated);
        setUser(authState.user);
        setIsLoading(false);
    };

    const login = async (email: string, password: string) => {
        // Implementation for login
    };

    const logout = async () => {
        tokenRefreshService.stopAutoRefresh();
        await tokenManager.clearAllTokens();
        setIsAuthenticated(false);
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{ isAuthenticated, isLoading, user, login, logout }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}