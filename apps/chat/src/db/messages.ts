import type { Message } from "@repo/types/schema"
import { and, eq } from "drizzle-orm"
import type { Database } from "./client"
import { messages, type CachedMessage, type MessageRow } from "./schema"

type MessageStatus = "sending" | "sent" | "failed"

/** Maps a server message to its cache row without redefining the wire type. */
function toRow(message: Message): MessageRow {
  const deleted = message.deletedAt != null
  return {
    uid: message.uid,
    messageId: message.messageId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    peerId: message.peerId,
    type: message.type,
    body: deleted ? null : (message.body ?? null),
    attachment: deleted ? null : (message.attachment ?? null),
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    deletedAt: message.deletedAt ?? null,
    version: message.version,
    isForwarded: message.isForwarded,
    replyTo: message.replyTo ?? null,
  }
}

/** Inserts the local row shown while an outgoing message is in flight. */
export async function cacheOptimisticMessage(
  db: Database,
  message: Message,
  pendingId: string,
): Promise<void> {
  await db.insert(messages).values({
    ...toRow(message),
    pendingId,
    status: "sending" satisfies MessageStatus,
  })
}

/**
 * Upserts a server message. When `pendingId` is set (the sender's echo), the
 * matching optimistic row is removed in the same transaction so the row is
 * replaced exactly once.
 */
export async function cacheServerMessage(
  db: Database,
  message: Message,
  pendingId?: string,
): Promise<void> {
  const row = toRow(message)

  db.transaction((tx) => {
    if (pendingId) {
      tx.delete(messages).where(eq(messages.pendingId, pendingId)).run()
    }

    tx.insert(messages)
      .values({ ...row, pendingId: pendingId ?? null, status: "sent" satisfies MessageStatus })
      .onConflictDoUpdate({
        target: messages.uid,
        set: {
          ...row,
          status: "sent" satisfies MessageStatus,
          ...(pendingId ? { pendingId } : {}),
        },
      })
      .run()
  })
}

/** Caches a page of history in one transaction. */
export async function cacheMessages(db: Database, batch: Message[]): Promise<void> {
  if (batch.length === 0) return

  db.transaction((tx) => {
    for (const message of batch) {
      const row = { ...toRow(message), status: "sent" satisfies MessageStatus }
      tx.insert(messages).values(row).onConflictDoUpdate({ target: messages.uid, set: row }).run()
    }
  })
}

/** Marks a delivered-but-unacknowledged send as failed. */
export async function failPendingMessage(db: Database, pendingId: string): Promise<void> {
  await db
    .update(messages)
    .set({ status: "failed" satisfies MessageStatus })
    .where(and(eq(messages.pendingId, pendingId), eq(messages.status, "sending")))
}

/** Physically removes a local-only row, e.g. when retrying a failed send. */
export async function removeCachedMessage(db: Database, uid: string): Promise<void> {
  await db.delete(messages).where(eq(messages.uid, uid))
}

/** Retains the message slot while redacting its content as a tombstone. */
export async function markCachedMessageDeleted(
  db: Database,
  uid: string,
  deletedAt = Date.now(),
): Promise<void> {
  await db
    .update(messages)
    .set({
      attachment: null,
      body: null,
      deletedAt,
      pinned: false,
    })
    .where(eq(messages.uid, uid))
}

export async function findCachedMessage(
  db: Database,
  uid: string,
): Promise<CachedMessage | undefined> {
  const rows = await db.select().from(messages).where(eq(messages.uid, uid)).limit(1)
  return rows[0]
}

/** Puts a row back after an optimistic delete is rejected. */
export async function restoreCachedMessage(db: Database, row: CachedMessage): Promise<void> {
  await db.insert(messages).values(row).onConflictDoUpdate({ target: messages.uid, set: row })
}

/** Optimistic edit; the server ack overwrites this with the authoritative body. */
export async function updateCachedMessageBody(
  db: Database,
  uid: string,
  body: string | null,
): Promise<void> {
  await db.update(messages).set({ body }).where(eq(messages.uid, uid))
}

export async function pinCachedMessage(db: Database, uid: string): Promise<void> {
  await db.update(messages).set({ pinned: true }).where(eq(messages.uid, uid))
}

export async function unpinCachedMessage(db: Database, uid: string): Promise<void> {
  await db.update(messages).set({ pinned: false }).where(eq(messages.uid, uid))
}

/** Unstars every starred message in one conversation. */
export async function unpinConversationMessages(
  db: Database,
  conversationId: string,
): Promise<void> {
  await db
    .update(messages)
    .set({ pinned: false })
    .where(and(eq(messages.pinned, true), eq(messages.conversationId, conversationId)))
}

/**
 * Deletes failed rows for one conversation. Media failures need a fresh pick
 * and text failures need a retype, so the rows cannot be retried in place;
 * they are pruned the next time the conversation is viewed instead of staying
 * on screen forever.
 */
export async function removeFailedMessages(db: Database, conversationId: string): Promise<void> {
  await db
    .delete(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.status, "failed")))
}
