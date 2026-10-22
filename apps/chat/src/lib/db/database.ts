import * as SQLite from "expo-sqlite";

const DB_NAME = "chatslock.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens the app database once and creates the schema on first run. Everything
 * is stored as JSON in a single document table so the cache stays schema-free
 * as API shapes evolve.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseSync(DB_NAME);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cache (
        entity TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY (entity, id)
      );
    `);
    return db;
  })();
  return dbPromise;
}
