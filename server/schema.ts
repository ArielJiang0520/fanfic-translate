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

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // 'series' | 'oneshot'. Fixed at creation: the type decides whether the project has children,
  // so changing it later would either orphan chapters or invent one.
  type: text('type').notNull(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

// The unit of work, for both project types: a one-shot owns exactly one of these, created with
// it, so the editor has a single code path and the difference stays purely navigational.
export const chapters = sqliteTable('chapters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  project_id: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  // Blank is normal; the client renders "Chapter N" from the row's place in the list.
  title: text('title').notNull().default(''),
  // Append is max + 1. Deleting leaves gaps, which is fine — only the order is read.
  position: integer('position').notNull(),
  source_text: text('source_text').notNull().default(''),
  translated_text: text('translated_text').notNull().default(''),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})
