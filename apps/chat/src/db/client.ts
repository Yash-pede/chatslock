import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/expo-sqlite"
import { migrate } from "drizzle-orm/expo-sqlite/migrator"
import * as SQLite from "expo-sqlite"
import migrations from "../../drizzle/migrations"
import { messages } from "./schema"

/** Single on-device database file shared by every local cache table. */
export const DATABASE_NAME = "chatslock.db"

const LOCAL_SCHEMA_VERSION = 2

function createDatabase(sqlite: SQLite.SQLiteDatabase) {
  return drizzle(sqlite)
}

export type Database = ReturnType<typeof createDatabase>

export interface LocalDatabase {
  db: Database
  sqlite: SQLite.SQLiteDatabase
}

let connection: Promise<LocalDatabase> | null = null

/** Drops every user table so a fresh migration set can be applied cleanly. */
async function resetLocalSchema(sqlite: SQLite.SQLiteDatabase): Promise<void> {
  const tables = await sqlite.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  )

  for (const { name } of tables) {
    await sqlite.execAsync(`DROP TABLE IF EXISTS "${name}"`)
  }
}

async function connect(): Promise<LocalDatabase> {
  const sqlite = await SQLite.openDatabaseAsync(DATABASE_NAME, {
    // Keeps `useLiveQuery` subscriptions working for future screens.
    enableChangeListener: true,
  })

  try {
    // Connection settings must be applied outside a migration transaction.
    await sqlite.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")

    const versionRow = await sqlite.getFirstAsync<{ db_version: number }>("PRAGMA db_version")
    if ((versionRow?.db_version ?? 0) < LOCAL_SCHEMA_VERSION) {
      await resetLocalSchema(sqlite)
    }

    const db = createDatabase(sqlite)
    const failure = await migrate(db, migrations)
    if (failure) {
      throw new Error("Could not prepare the local database.")
    }

    await sqlite.execAsync(`PRAGMA db_version = ${LOCAL_SCHEMA_VERSION}`)

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
