import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

// Opened at import time, so DB_PATH must be set before the first import of this file.
const dbPath = process.env.DB_PATH || './local.db'

const sqlite = new Database(dbPath)
sqlite.run('PRAGMA journal_mode = WAL;')
sqlite.run('PRAGMA foreign_keys = ON;')

export const db = drizzle(sqlite, { schema })

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle')
if (existsSync(migrationsFolder)) {
  migrate(db, { migrationsFolder })
}

export * from './schema'
