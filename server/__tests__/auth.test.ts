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
    expect(row?.password_hash).not.toContain(TEST_PASSWORD)

    expect(sidFrom(res)).toBeTruthy()
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
  })

  test('rejects a body it cannot accept', async () => {
    const existing = await signup()
    const bad: [Record<string, unknown>, number, string][] = [
      [{ username: uniqueUsername() }, 400, 'Missing fields'],
      [{ password: TEST_PASSWORD }, 400, 'Missing fields'],
      [{ username: uniqueUsername(), password: 'short' }, 400, '8 characters'],
      [{ username: existing.username, password: TEST_PASSWORD }, 409, 'Username already taken'],
    ]

    for (const [body, status, error] of bad) {
      const res = await call('POST', '/api/auth/signup', { body })
      expect(res.status).toBe(status)
      expect(res.body.error).toContain(error)
    }
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

  test('401s on a wrong password or an unknown username', async () => {
    const agent = await signup()
    const bad = [
      { username: agent.username, password: 'wrong-password' },
      { username: uniqueUsername('ghost'), password: TEST_PASSWORD },
    ]

    for (const body of bad) {
      const res = await call('POST', '/api/auth/login', { body })
      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid credentials')
    }
  })
})

describe('POST /api/auth/logout', () => {
  test('invalidates the session, and succeeds without one', async () => {
    const agent = await signup()
    expect((await call('POST', '/api/auth/logout', { agent })).status).toBe(204)
    expect((await call('GET', '/api/me', { agent })).status).toBe(401)
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

  test('401s without a session cookie, and on an unknown session id', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401)
    expect((await call('GET', '/api/me', { agent: { cookie: 'sid=not-a-real-session' } })).status).toBe(401)
  })
})
