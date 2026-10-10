import axios from 'axios';
import { getAuthApiUrl } from '../config';
import { tokenManager } from './tokenManager';

/**
 * A bare axios instance for auth calls. Deliberately separate from the
 * authenticated `apiClient`: auth endpoints must not run through the 401
 * refresh interceptor (refreshing from within a refresh would recurse). The
 * base URL is resolved per request from the configured API URL.
 */
const http = axios.create({
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
    config.baseURL = getAuthApiUrl();
    return config;
});

export interface AuthTokens {
    accessToken: string;
    idToken?: string;
    refreshToken?: string;
    expiresIn: number;
}

export interface OtpChallenge {
    username: string;
    session: string;
    challengeName: string;
}

export interface ApiErrorBody {
    message?: string;
    errors?: unknown;
}

/** Pull the backend's human-readable message out of an axios error. */
export function extractErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data;

        // A JSON body ({ success, message } / { message, errors }).
        if (data && typeof data === 'object') {
            const body = data as ApiErrorBody;
            if (typeof body.message === 'string' && body.message.trim()) {
                return body.message;
            }
            if (typeof body.errors === 'string' && body.errors.trim()) {
                return body.errors;
            }
        }
        // A plain-text body.
        if (typeof data === 'string' && data.trim()) {
            return data;
        }

        if (!error.response) return 'Network error. Check your connection.';
        if (error.response.status === 401) return 'Incorrect credentials.';
        if (error.response.status === 403) return 'You are not allowed to do that.';
        // Never surface axios's own "Request failed with status code N".
        return 'Something went wrong. Please try again.';
    }

    if (error instanceof Error && error.message) return error.message;
    return 'Something went wrong. Please try again.';
}

async function persist(data: AuthTokens): Promise<AuthTokens> {
    tokenManager.setTokens({
        accessToken: data.accessToken,
        idToken: data.idToken,
        expiresIn: data.expiresIn,
    });
    if (data.refreshToken) {
        await tokenManager.setRefreshToken(data.refreshToken);
    }
    return data;
}

/** Step 1 of phone sign-in — sends the OTP. */
export async function requestOtp(phone: string): Promise<OtpChallenge> {
    const { data } = await http.post<OtpChallenge>('/otp/request', {
        phone,
        role: 'user',
    });
    return data;
}

/** Step 2 of phone sign-in — exchanges the code for tokens. */
export async function verifyOtp(params: {
    otp: string;
    username: string;
    session: string;
}): Promise<AuthTokens> {
    const { data } = await http.post<AuthTokens>('/otp/verify', params);
    return persist(data);
}

/** Username + password sign-in. */
export async function login(params: {
    username: string;
    password: string;
}): Promise<AuthTokens> {
    const { data } = await http.post<AuthTokens>('/login', params);
    return persist(data);
}

/**
 * Exchange the stored refresh token for a fresh access token. Cognito keeps
 * the refresh token the same here, so the caller's stored one stays valid.
 */
export async function refresh(): Promise<AuthTokens> {
    const refreshToken = await tokenManager.getRefreshToken();
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    const { data } = await http.post<AuthTokens>('/refresh', { refreshToken });
    tokenManager.setTokens({
        accessToken: data.accessToken,
        idToken: data.idToken,
        expiresIn: data.expiresIn,
    });
    return { ...data, refreshToken };
}

/** Revoke the session server-side (best effort) and clear local tokens. */
export async function logout(): Promise<void> {
    const accessToken = tokenManager.getRawAccessToken();
    try {
        if (accessToken) {
            await http.post(
                '/logout',
                {},
                { headers: { Authorization: `Bearer ${accessToken}` } },
            );
        }
    } catch {
        // A failed sign-out shouldn't trap the user in the app.
    } finally {
        await tokenManager.clearAllTokens();
    }
}
