import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import * as argon2 from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { db, sessions, users } from '../db'
import {
  type Variables,
  SESSION_TTL_MS,
  authMiddleware,
  generateSessionId,
  setSessionCookie,
} from '../middleware'

const auth = new Hono<{ Variables: Variables }>()

const MIN_PASSWORD_LENGTH = 8

function startSession(c: Context, userId: number, now = Date.now()) {
  const sid = generateSessionId()
  db.insert(sessions).values({ id: sid, user_id: userId, expires_at: now + SESSION_TTL_MS }).run()
  setSessionCookie(c, sid)
}

auth.post('/auth/signup', async c => {
  const { username, password } = await c.req.json().catch(() => ({}))
  if (!username || !password) return c.json({ error: 'Missing fields' }, 400)
  if (password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
  }

  const existing = db.select().from(users).where(eq(users.username, username)).get()
  if (existing) return c.json({ error: 'Username already taken' }, 409)

  const now = Date.now()
  const hash = await argon2.hash(password)
  const user = db.insert(users).values({ username, password_hash: hash, created_at: now }).returning().get()

  startSession(c, user.id, now)
  return c.json({ id: user.id, username: user.username })
})

auth.post('/auth/login', async c => {
  const { username, password } = await c.req.json().catch(() => ({}))
  if (!username || !password) return c.json({ error: 'Missing fields' }, 400)

  const user = db.select().from(users).where(eq(users.username, username)).get()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await argon2.verify(user.password_hash, password)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  startSession(c, user.id)
  return c.json({ id: user.id, username: user.username })
})

auth.post('/auth/logout', c => {
  const sid = getCookie(c, 'sid')
  if (sid) db.delete(sessions).where(eq(sessions.id, sid)).run()
  deleteCookie(c, 'sid', { path: '/' })
  return new Response(null, { status: 204 })
})

auth.get('/me', authMiddleware, c => {
  const userId = c.get('userId')
  const user = db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, userId)).get()
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json(user)
})

export default auth
