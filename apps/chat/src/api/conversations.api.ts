import {apiClient} from "@/api/client";
import type {ConversationUserProfile, Message, UserMemberConversation} from "@repo/types/schema";

export type {ConversationUserProfile, Message, UserMemberConversation};

/** `GET /api/conversations/chat` — one page of the caller's conversations. */
export interface ChatPage {
    conversations: UserMemberConversation[];
}

/** `POST /api/conversations/profiles` — public profiles for up to 25 user ids. */
export interface ProfilesResponse {
    profiles: ConversationUserProfile[];
}

/** `GET /api/conversations/:conversationId/messages` — latest history page. */
export interface MessagesResponse {
    messages: Message[];
}

/** Max ids accepted by one profiles request (mirrors the server schema). */
export const MAX_PROFILE_LOOKUP = 25;

/** Unwraps the server's `{ ok, data }` envelope when present. */
function unwrap<T>(body: unknown): T {
    if (body && typeof body === "object" && "data" in body && "ok" in body) {
        return (body as { data: T }).data;
    }
    return body as T;
}

/**
 * Conversation endpoints. Screens call these instead of `apiClient` directly so
 * URL shapes and envelope handling stay in one place.
 */
export const conversationsApi = {
    /** `GET /api/conversations/chat?pageSize=` — caller's conversation memberships. */
    getChatPage: async (input: { pageSize?: number } = {}): Promise<ChatPage> => {
        const {data} = await apiClient.get("/api/conversations/chat", {
            params: {pageSize: input.pageSize ?? MAX_PROFILE_LOOKUP},
        });
        return unwrap<ChatPage>(data);
    },

    /** `POST /api/conversations/profiles` — peer profiles by id (batched). */
    getProfiles: async (userIds: string[]): Promise<ConversationUserProfile[]> => {
        if (userIds.length === 0) return [];

        const {data} = await apiClient.post("/api/conversations/profiles", {
            userIds: userIds.slice(0, MAX_PROFILE_LOOKUP),
        });
        return unwrap<ProfilesResponse>(data).profiles;
    },

    /** `GET /api/conversations/:conversationId/messages` — latest messages, newest first. */
    getMessages: async (conversationId: string): Promise<MessagesResponse> => {
        // The composite id contains `#`, which must stay encoded inside the path segment.
        const {data} = await apiClient.get(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
        return unwrap<MessagesResponse>(data);
    },
};
