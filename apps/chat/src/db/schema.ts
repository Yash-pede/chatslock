import type { PeerUserStatus } from "@repo/types/req"
import type { getUser, Message, UserMemberConversation } from "@repo/types/schema"
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

/**
 * Placeholder table for the on-device cache. Real profile/conversation tables
 * will be added here once the offline data model is settled.
 */
export const chats = sqliteTable("chats", {
  id: text("id").primaryKey().notNull(),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
})

/**
 * One row per server message. The message columns mirror `Message` from
 * `@repo/types/schema`; `attachment` is stored as JSON so the nested shape stays
 * defined by the shared schema instead of being duplicated here. Timestamps are
 * the raw epoch milliseconds the API sends.
 *
 * `pendingId` and `status` are local-only send state. They let an outgoing
 * message appear before the server ack and be replaced in place afterwards.
 */
export const messages = sqliteTable(
  "messages",
  {
    messageId: text("message_id").primaryKey().notNull(),
    conversationId: text("conversation_id").notNull(),
    senderId: text("sender_id").notNull(),
    type: text("type").$type<Message["type"]>().notNull(),
    body: text("body"),
    attachment: text("attachment", { mode: "json" }).$type<NonNullable<Message["attachment"]>>(),
    createdAt: integer("created_at").notNull(),
    editedAt: integer("edited_at"),
    deletedAt: integer("deleted_at"),
    pendingId: text("pending_id"),
    status: text("status"),
    starred: integer({ mode: "boolean" }).notNull().default(false),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_id_idx").on(
      table.conversationId,
      table.messageId,
    ),
  }),
)

export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type MessageRow = typeof messages.$inferInsert
export type CachedMessage = typeof messages.$inferSelect

/**
 * One cached chat-list row per (signed-in user, conversation). `position`
 * mirrors the server's display order so the offline list matches the online
 * one. The composite key keeps two accounts on the same device separate.
 */
export const conversations = sqliteTable(
  "conversations",
  {
    ownerUserId: text("owner_user_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    conversationType: text("conversation_type")
      .$type<UserMemberConversation["conversationType"]>()
      .notNull(),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessageId: text("lastMessageId"),
    lastMessagePreview: text("lastMessagePreview"),
    lastMessageAt: integer("lastMessageAt"),
    position: integer("position").notNull(),
    starred: integer({ mode: "boolean" }).notNull().default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.ownerUserId, table.conversationId] }),
    ownerPositionIdx: index("conversations_owner_position_idx").on(
      table.ownerUserId,
      table.position,
    ),
  }),
)

/**
 * Last-known public profile for a peer. This is the `ConversationUserProfile`
 * shape plus presence, so the chat list and public profile page can render
 * without a network round-trip.
 */
export const profiles = sqliteTable(
  "profiles",
  {
    userId: text("user_id").primaryKey().notNull(),
    username: text("username").notNull(),
    fullName: text("full_name").notNull(),
    avatar: text("avatar"),
    lastActiveAt: integer("last_active_at").notNull(),
    status: text("status").$type<PeerUserStatus>().notNull(),
  },
  (table) => ({
    usernameIdx: uniqueIndex("profiles_username_idx").on(table.username),
  }),
)

export type ConversationRow = typeof conversations.$inferInsert
export type CachedConversation = typeof conversations.$inferSelect
export type ProfileRow = typeof profiles.$inferInsert
export type CachedProfile = typeof profiles.$inferSelect

/**
 * The signed-in user's own `/me` profile. Separate from `profiles` because it
 * carries role/agent fields and controls onboarding routing. It lets a cold
 * start with no network open the cached app instead of the sign-in gate.
 */
export const selfProfile = sqliteTable("self_profile", {
  userId: text("user_id").primaryKey().notNull(),
  username: text("username").notNull(),
  fullName: text("full_name").notNull(),
  avatar: text("avatar"),
  phone: text("phone"),
  role: text("role").$type<getUser["role"]>().notNull(),
  agentId: text("agent_id"),
  lastActiveAt: integer("last_active_at").notNull(),
})

export type SelfProfileRow = typeof selfProfile.$inferInsert
export type CachedSelfProfile = typeof selfProfile.$inferSelect
