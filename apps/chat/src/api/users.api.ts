import {apiClient} from "@/api/client";
import type {getUser} from "@repo/types/schema";
import type {AvatarContentType, UserOnboardingRequest} from "@repo/types/req";

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

    /** `PATCH /api/users/me` — rename and/or set the avatar URL; returns the updated profile. */
    updateMe: async (input: {fullName?: string; avatar?: string}): Promise<Profile> => {
        const {data} = await apiClient.patch("/api/users/me", input);
        return unwrap<Profile>(data);
    },

    /**
     * Full avatar change: asks for a short-lived presigned PUT, uploads the file
     * bytes directly to S3, then confirms the key so the profile row stores the
     * resulting public URL. Returns the new avatar URL.
     */
    uploadAvatar: async (input: {
        uri: string;
        contentType: AvatarContentType;
        fileName: string;
    }): Promise<string> => {
        const {data} = await apiClient.post("/api/users/avatar", {
            contentType: input.contentType,
            fileName: input.fileName,
        });
        const {uploadUrl, key} = unwrap<{uploadUrl: string; key: string}>(data);

        const file = await fetch(input.uri);
        const blob = await file.blob();

        // S3 presigned PUT: no auth header, the signature is in the URL.
        const upload = await fetch(uploadUrl, {
            method: "PUT",
            headers: {"Content-Type": input.contentType},
            body: blob,
        });
        if (!upload.ok) throw new Error("Could not upload the image. Please try again.");

        const confirmed = await apiClient.post("/api/users/avatar/confirm", {key});
        const {avatar} = unwrap<{avatar: string}>(confirmed.data);

        return avatar;
    },
};
