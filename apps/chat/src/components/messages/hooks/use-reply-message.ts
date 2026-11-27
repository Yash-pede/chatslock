import { useEffect, useState } from "react"
import { eq } from "drizzle-orm"
import { conversationsApi } from "@/api/conversations.api"
import { cacheMessages, useLocalDb } from "@/db"
import { messages as messagesTable, type CachedMessage } from "@/db/schema"

/** One-line preview of a quoted message, or `"Message deleted"` for tombstones. */
function quotedPreview(message: {
  body?: string | null
  attachment?: { fileName?: string } | null
  deletedAt?: number | null
}): string {
  if (message.deletedAt) return "Message deleted"
  if (message.body && message.body.length > 0) return message.body
  const fileName = message.attachment?.fileName
  if (fileName && fileName.length > 0) return fileName
  return "Attachment"
}

export interface ReplyMessageResult {
  /** One-line quoted text; `null` while the lookup is still in flight. */
  preview: string | null
  /** The quoted message could not be found anywhere. */
  unavailable: boolean
}

/**
 * Resolves the message a reply points at (`replyTo` uid): from the local cache
 * first, then via the single-message API (and caches the result). A failed
 * lookup sets `unavailable` so the bubble can show "Preview unavailable".
 */
export function useReplyMessage(
  conversationId: string,
  replyTo: string | null | undefined,
): ReplyMessageResult {
  const { db } = useLocalDb()
  const [resolved, setResolved] = useState<{
    uid: string
    preview: string | null
    unavailable: boolean
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!replyTo) return

    void (async () => {
      try {
        const rows = await db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.uid, replyTo))
          .limit(1)

        const cached: CachedMessage | undefined = rows[0]
        if (cached) {
          if (!cancelled) {
            setResolved({ uid: replyTo, preview: quotedPreview(cached), unavailable: false })
          }
          return
        }

        // Not cached: fetch the single message, then keep it cached for later.
        try {
          const message = await conversationsApi.getMessage({ conversationId, uid: replyTo })
          await cacheMessages(db, [message])
          if (!cancelled) {
            setResolved({ uid: replyTo, preview: quotedPreview(message), unavailable: false })
          }
        } catch {
          if (!cancelled) setResolved({ uid: replyTo, preview: null, unavailable: true })
        }
      } catch {
        if (!cancelled) setResolved({ uid: replyTo, preview: null, unavailable: true })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [conversationId, db, replyTo])

  // Rows recycle across messages, so only accept a result that still matches
  // the requested uid; anything stale reads as "still loading".
  const current = replyTo && resolved?.uid === replyTo ? resolved : null

  return {
    preview: current?.preview ?? null,
    unavailable: current?.unavailable ?? false,
  }
}
