import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { db } from '../db'

const health = new Hono()

health.get('/', c => {
  db.get(sql`select 1`)
  return c.json({ ok: true })
})

export default health
