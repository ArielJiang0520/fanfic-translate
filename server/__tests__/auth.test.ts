import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db, users } from '../db'
import { TEST_PASSWORD, call, signup, sidFrom, uniqueUsername } from './helpers'

describe('POST /api/auth/signup', () => {
  test('writes the user row and opens a session', async () => {
    const username = uniqueUsername()
    const { status, body, res } = await call<{ id: number; username: string }>('POST', '/api/auth/signup', {
      body: { username, password: TEST_PASSWORD },
    })

    expect(status).toBe(200)
    expect(body).toEqual({ id: expect.any(Number), username })

    const row = db.select().from(users).where(eq(users.username, username)).get()
    expect(row?.id).toBe(body.id)
    // Stored hashed, never in the clear.
    expect(row?.password_hash).not.toContain(TEST_PASSWORD)

    expect(sidFrom(res)).toBeTruthy()
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
  })

  test('rejects missing fields', async () => {
    const { status, body } = await call('POST', '/api/auth/signup', { body: { username: uniqueUsername() } })
    expect(status).toBe(400)
    expect(body.error).toBe('Missing fields')
  })

  test('rejects a password under 8 characters', async () => {
    const { status, body } = await call('POST', '/api/auth/signup', {
      body: { username: uniqueUsername(), password: 'short' },
    })
    expect(status).toBe(400)
    expect(body.error).toContain('8 characters')
  })

  test('rejects a username already taken', async () => {
    const existing = await signup()
    const { status, body } = await call('POST', '/api/auth/signup', {
      body: { username: existing.username, password: TEST_PASSWORD },
    })
    expect(status).toBe(409)
    expect(body.error).toBe('Username already taken')
  })
})

describe('POST /api/auth/login', () => {
  test('returns the user and a fresh session cookie', async () => {
    const agent = await signup()
    const { status, body, res } = await call<{ id: number }>('POST', '/api/auth/login', {
      body: { username: agent.username, password: agent.password },
    })

    expect(status).toBe(200)
    expect(body.id).toBe(agent.userId)
    expect(sidFrom(res)).toBeTruthy()
    expect(`sid=${sidFrom(res)}`).not.toBe(agent.cookie)
  })

  test('rejects a wrong password', async () => {
    const agent = await signup()
    const { status, body } = await call('POST', '/api/auth/login', {
      body: { username: agent.username, password: 'wrong-password' },
    })
    expect(status).toBe(401)
    expect(body.error).toBe('Invalid credentials')
  })

  test('rejects an unknown username', async () => {
    const { status } = await call('POST', '/api/auth/login', {
      body: { username: uniqueUsername('ghost'), password: TEST_PASSWORD },
    })
    expect(status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  test('invalidates the session', async () => {
    const agent = await signup()
    expect((await call('POST', '/api/auth/logout', { agent })).status).toBe(204)
    expect((await call('GET', '/api/me', { agent })).status).toBe(401)
  })

  test('succeeds without a session', async () => {
    expect((await call('POST', '/api/auth/logout')).status).toBe(204)
  })
})

describe('GET /api/me', () => {
  test('reads the signed-in user back', async () => {
    const agent = await signup()
    const { status, body } = await call('GET', '/api/me', { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ id: agent.userId, username: agent.username })
  })

  test('401s without a session cookie', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401)
  })

  test('401s on an unknown session id', async () => {
    const { status } = await call('GET', '/api/me', { agent: { cookie: 'sid=not-a-real-session' } })
    expect(status).toBe(401)
  })
})
