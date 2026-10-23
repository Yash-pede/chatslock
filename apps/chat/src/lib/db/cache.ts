import type { Message, UserMemberConversation, getUser } from "@repo/types/schema"
import { getDb } from "./database"

type Profile = getUser

/**
 * Simple document cache over SQLite: everything is `{entity, id, data}`.
 * Entities: "profile", "conversation", "message" (message ids are
 * `conversationId:messageId` so a conversation's page can be fetched by prefix).
 */

export async function cachePut(entity: string, id: string, data: unknown): Promise<void> {
  const db = await getDb()
  await db.runAsync(
    "INSERT OR REPLACE INTO cache (entity, id, data, updatedAt) VALUES (?, ?, ?, ?)",
    entity,
    id,
    JSON.stringify(data),
    Date.now(),
  )
}

export async function cachePutMany(
  entity: string,
  items: { id: string; data: unknown }[],
): Promise<void> {
  const db = await getDb()
  const now = Date.now()
  await db.withTransactionAsync(async () => {
    for (const { id, data } of items) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cache (entity, id, data, updatedAt) VALUES (?, ?, ?, ?)",
        entity,
        id,
        JSON.stringify(data),
        now,
      )
    }
  })
}

export async function cacheGet<T>(entity: string, id: string): Promise<T | null> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ data: string }>(
    "SELECT data FROM cache WHERE entity = ? AND id = ?",
    entity,
    id,
  )
  return row ? (JSON.parse(row.data) as T) : null
}

export async function cacheGetAll<T>(entity: string): Promise<T[]> {
  const db = await getDb()
  const rows = await db.getAllAsync<{ data: string }>(
    "SELECT data FROM cache WHERE entity = ? ORDER BY updatedAt DESC",
    entity,
  )
  return rows.map((row) => JSON.parse(row.data) as T)
}

export async function cacheRemove(entity: string, id: string): Promise<void> {
  const db = await getDb()
  await db.runAsync("DELETE FROM cache WHERE entity = ? AND id = ?", entity, id)
}

export const cacheProfile = (profile: Profile) => cachePut("profile", "me", profile)
export const getCachedProfile = () => cacheGet<Profile>("profile", "me")

export const cacheConversations = (list: UserMemberConversation[]) =>
  cachePutMany(
    "conversation",
    list.map((conversation) => ({ id: conversation.conversationId, data: conversation })),
  )
export const getCachedConversations = () => cacheGetAll<UserMemberConversation>("conversation")
export const getCachedConversation = (conversationId: string) =>
  cacheGet<UserMemberConversation>("conversation", conversationId)

/** Merges a partial update into a cached conversation row (e.g. unreadCount → 0). */
export async function patchCachedConversation(
  conversationId: string,
  patch: Partial<UserMemberConversation>,
): Promise<void> {
  const current = await getCachedConversation(conversationId)
  if (!current) return
  await cachePut("conversation", conversationId, { ...current, ...patch })
}

const messageKey = (conversationId: string, messageId: string) => `${conversationId}:${messageId}`

export const cacheMessages = (conversationId: string, messages: Message[]) =>
  cachePutMany(
    "message",
    messages.map((message) => ({
      id: messageKey(conversationId, message.messageId),
      data: message,
    })),
  )
export const appendCachedMessage = (conversationId: string, message: Message) =>
  cachePut("message", messageKey(conversationId, message.messageId), message)

export const getCachedMessages = (conversationId: string) =>
  cacheGetAll<Message>("message").then((messages) =>
    messages.filter((message) => message.conversationId === conversationId),
  )
