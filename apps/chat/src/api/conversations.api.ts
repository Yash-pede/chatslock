import { File as ExpoFile } from "expo-file-system"
import { apiClient } from "@/api/client"
import type {
  ConversationId,
  ConversationUserProfile,
  Message,
  UserMemberConversation,
} from "@repo/types/schema"
import type { MediaContentType } from "@repo/types/req"

/** A media upload target returned by `POST /api/conversations/media` (presigned POST). */
export interface MediaPresignResult {
  uploadUrl: string
  /** S3 fields to send as multipart form fields, plus the file as field `"file"`. */
  fields: Record<string, string>
  /** Server-chosen object key; also the path of the stored object. */
  key: string
}

export type { ConversationUserProfile, Message, UserMemberConversation }

/** `GET /api/conversations/chat` — one page of the caller's conversations. */
export interface ChatPage {
  conversations: UserMemberConversation[]
}

/** `POST /api/conversations/profiles` — public profiles for up to 25 user ids. */
export interface ProfilesResponse {
  profiles: ConversationUserProfile[]
}

/** `GET /api/conversations/:conversationId/messages` — latest history page. */
export interface MessagesResponse {
  messages: Message[]
}

/** Max ids accepted by one profiles request (mirrors the server schema). */
export const MAX_PROFILE_LOOKUP = 25

/** Unwraps the server's `{ ok, data }` envelope when present. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body && "ok" in body) {
    return (body as { data: T }).data
  }
  return body as T
}

/** HTTP status of a failed axios call, or `undefined` when offline/aborted. */
export function responseStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status
}

/**
 * Conversation endpoints. Screens call these instead of `apiClient` directly so
 * URL shapes and envelope handling stay in one place.
 */
export const conversationsApi = {
  /** `GET /api/conversations/chat?pageSize=` — caller's conversation memberships. */
  getChatPage: async (input: { pageSize?: number } = {}): Promise<ChatPage> => {
    const { data } = await apiClient.get("/api/conversations/chat", {
      params: { pageSize: input.pageSize ?? MAX_PROFILE_LOOKUP },
    })
    return unwrap<ChatPage>(data)
  },

  /** `POST /api/conversations/profiles` — peer profiles by id (batched). */
  getProfiles: async (userIds: string[]): Promise<ConversationUserProfile[]> => {
    if (userIds.length === 0) return []

    const { data } = await apiClient.post("/api/conversations/profiles", {
      userIds: userIds.slice(0, MAX_PROFILE_LOOKUP),
    })
    return unwrap<ProfilesResponse>(data).profiles
  },

  /** `POST /api/conversations/messages` — latest messages, newest first. */
  getMessages: async (conversationId: ConversationId): Promise<MessagesResponse> => {
    const { data } = await apiClient.post("/api/conversations/messages", { conversationId })
    return unwrap<MessagesResponse>(data)
  },

  /** `POST /api/conversations/media` — presigns a media upload (S3 POST). */
  getMediaPresign: async (input: {
    contentType: MediaContentType
    fileName: string
    fileSize: number
    conversationId: string
  }): Promise<MediaPresignResult> => {
    const { data } = await apiClient.post("/api/conversations/media", input)
    return unwrap<MediaPresignResult>(data)
  },
}

/** Uploads a local file to the media bucket via the presigned POST (multipart). */
export async function uploadMediaToBucket(input: {
  uploadUrl: string
  fields: Record<string, string>
  file: { uri: string; name: string; type: string }
}): Promise<void> {
  const form = new FormData()
  for (const [name, value] of Object.entries(input.fields)) {
    form.append(name, value)
  }
  // The file is last, under the field name the presigned policy expects. Expo's
  // winter fetch cannot serialize a `{ uri, name, type }` polyfill part, so use
  // an expo-file-system `File`, which implements Blob and exposes `.bytes()`.
  form.append("file", new ExpoFile(input.file.uri) as unknown as Blob)
  const res = await fetch(input.uploadUrl, { method: "POST", body: form })
  if (!res.ok) throw new Error("Could not upload the file. Please try again.")
}
