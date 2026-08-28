import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// The single source of truth for the schema. Change a table here, then run
// `npm run db:generate` to write a migration into `drizzle/`; the server applies
// pending migrations on startup (see db.ts).

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  created_at: integer('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires_at: integer('expires_at').notNull(),
})
