import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/expo-sqlite"
import { migrate } from "drizzle-orm/expo-sqlite/migrator"
import * as SQLite from "expo-sqlite"
import migrations from "../../drizzle/migrations"
import { messages } from "./schema"

/** Single on-device database file shared by every local cache table. */
export const DATABASE_NAME = "chatslock.db"

function createDatabase(sqlite: SQLite.SQLiteDatabase) {
  return drizzle(sqlite)
}

export type Database = ReturnType<typeof createDatabase>

export interface LocalDatabase {
  db: Database
  sqlite: SQLite.SQLiteDatabase
}

let connection: Promise<LocalDatabase> | null = null

async function connect(): Promise<LocalDatabase> {
  const sqlite = await SQLite.openDatabaseAsync(DATABASE_NAME, {
    // Keeps `useLiveQuery` subscriptions working for future screens.
    enableChangeListener: true,
  })

  try {
    // Connection settings must be applied outside a migration transaction.
    await sqlite.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")

    const db = createDatabase(sqlite)
    const failure = await migrate(db, migrations)
    if (failure) {
      throw new Error("Could not prepare the local database.")
    }

    // A send that was in flight when the process died can never receive its
    // ack. Mark it failed so it can be retried instead of looking "sending"
    // forever.
    await db.update(messages).set({ status: "failed" }).where(eq(messages.status, "sending"))

    return { db, sqlite }
  } catch (error) {
    // Leave no half-initialized connection behind for the retry path.
    await sqlite.closeAsync().catch(() => undefined)
    throw error
  }
}

/**
 * Opens and migrates the local database once per app process. Concurrent
 * callers share the same promise, so startup cannot open or migrate twice.
 */
export function openLocalDatabase(): Promise<LocalDatabase> {
  connection ??= connect().catch((error: unknown) => {
    connection = null
    throw error
  })
  return connection
}
