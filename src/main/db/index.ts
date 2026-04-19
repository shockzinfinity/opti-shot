// @TASK P0-T0.2 - Database connection manager
// @SPEC specs/domain/resources.yaml

import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { join } from 'path'
import * as schema from './schema'
import { migrate } from './migrate'

let _db: ReturnType<typeof createDb> | null = null

function getDbPath(): string {
  // Test environment: use in-memory or custom path
  if (process.env.OPTISHOT_DB_PATH) {
    return process.env.OPTISHOT_DB_PATH
  }

  // Electron environment: use app.getPath('userData')
  try {
    // Dynamic import to avoid errors in test/non-Electron contexts
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron')
    return join(app.getPath('userData'), 'optishot.db')
  } catch {
    // Fallback for non-Electron environments (tests, scripts)
    return join(process.cwd(), 'optishot.db')
  }
}

function createDb(dbPath?: string) {
  const path = dbPath ?? getDbPath()
  const sqlite = new Database(path)

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL')
  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  return db
}

/**
 * Get the shared database instance (singleton).
 * Creates the database and runs migrations on first call.
 */
export function getDb(dbPath?: string) {
  if (!_db) {
    _db = createDb(dbPath)
    // Run migrations on first connection
    migrate(_db)
  }
  return _db
}

/**
 * Close the database connection and reset singleton.
 * Call during app shutdown or between tests.
 */
export function closeDb(): void {
  if (_db) {
    _db.$client.close()
    _db = null
  }
}

/**
 * Create a fresh database instance (non-singleton).
 * Useful for tests that need isolated databases.
 */
export function createTestDb(dbPath = ':memory:') {
  const db = createDb(dbPath)
  migrate(db)
  return db
}

export { schema }
export type AppDatabase = ReturnType<typeof createDb>
