import {apiClient} from "@/api/client";
import type {getUser} from "@repo/types/schema";
import type {UserOnboardingRequest} from "@repo/types/req";

/** The signed-in user's profile, as returned by `GET /api/users/me`. */
export type Profile = getUser;

/** True when the profile does not exist yet (first login → onboarding). */
export function isMissingProfile(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const {isAxiosError, response} = error as {
        isAxiosError?: boolean;
        response?: { status?: number };
    };
    return isAxiosError === true && response?.status === 404;
}

/** Unwraps the server's `{ ok, data }` envelope when present. */
function unwrap<T>(body: unknown): T {
    if (body && typeof body === "object" && "data" in body && "ok" in body) {
        return (body as { data: T }).data;
    }
    return body as T;
}

/** Body of `POST /api/users/onboarding`, typed from the server-side schema. */
export type OnboardingInput = UserOnboardingRequest["body"];

/**
 * User endpoints. Screens call these instead of `apiClient` directly so URL
 * shapes and envelope handling stay in one place.
 */
export const usersApi = {
    /** `GET /api/users/me` — 404 means the profile row has not been created yet. */
    getMe: async (): Promise<Profile> => {
        const {data} = await apiClient.get("/api/users/me");
        return unwrap<Profile>(data);
    },

    /** `POST /api/users/onboarding` — creates the profile row for a fresh session. */
    onboard: async (input: OnboardingInput): Promise<void> => {
        await apiClient.post("/api/users/onboarding", input);
    },
};
