import type { Message } from "@repo/types/schema"
import { and, eq } from "drizzle-orm"
import type { Database } from "./client"
import { messages, type CachedMessage, type MessageRow } from "./schema"

type MessageStatus = "sending" | "sent" | "failed"

/** Maps a server message to its cache row without redefining the wire type. */
function toRow(message: Message): MessageRow {
  const deleted = message.deletedAt != null
  return {
    messageId: message.messageId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    body: deleted ? null : (message.body ?? null),
    attachment: deleted ? null : (message.attachment ?? null),
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    deletedAt: message.deletedAt ?? null,
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
        target: messages.messageId,
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
      tx.insert(messages)
        .values(row)
        .onConflictDoUpdate({ target: messages.messageId, set: row })
        .run()
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
export async function removeCachedMessage(db: Database, messageId: string): Promise<void> {
  await db.delete(messages).where(eq(messages.messageId, messageId))
}

/** Retains the message slot while redacting its content as a tombstone. */
export async function markCachedMessageDeleted(
  db: Database,
  messageId: string,
  deletedAt = Date.now(),
): Promise<void> {
  await db
    .update(messages)
    .set({
      attachment: null,
      body: null,
      deletedAt,
    })
    .where(eq(messages.messageId, messageId))
}

export async function findCachedMessage(
  db: Database,
  messageId: string,
): Promise<CachedMessage | undefined> {
  const rows = await db.select().from(messages).where(eq(messages.messageId, messageId)).limit(1)
  return rows[0]
}

/** Puts a row back after an optimistic delete is rejected. */
export async function restoreCachedMessage(db: Database, row: CachedMessage): Promise<void> {
  await db.insert(messages).values(row).onConflictDoUpdate({ target: messages.messageId, set: row })
}

/** Optimistic edit; the server ack overwrites this with the authoritative body. */
export async function updateCachedMessageBody(
  db: Database,
  messageId: string,
  body: string | null,
): Promise<void> {
  await db.update(messages).set({ body }).where(eq(messages.messageId, messageId))
}
