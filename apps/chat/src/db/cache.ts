import type { Database } from "./client"
import { chats, conversations, messages, profiles, selfProfile } from "./schema"

/**
 * Wipes cached account data on sign-out. The schema (and its migration history)
 * stays in place; only rows are removed.
 */
export async function clearLocalCache(db: Database): Promise<void> {
  db.transaction((tx) => {
    tx.delete(messages).run()
    tx.delete(conversations).run()
    tx.delete(profiles).run()
    tx.delete(selfProfile).run()
    tx.delete(chats).run()
  })
}
