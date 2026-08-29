import { app } from '../index'

export const TEST_PASSWORD = 'test-password'

let counter = 0

export function uniqueUsername(prefix = 'user') {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}`
}

export interface Agent {
  userId: number
  username: string
  password: string
  cookie: string
}

export function sidFrom(res: Response): string | null {
  return res.headers.get('set-cookie')?.match(/sid=([^;]+)/)?.[1] ?? null
}

export async function call<T = any>(
  method: string,
  path: string,
  opts: { body?: unknown; agent?: Pick<Agent, 'cookie'> } = {},
): Promise<{ status: number; body: T; res: Response }> {
  const headers: Record<string, string> = {}
  if (opts.agent) headers.cookie = opts.agent.cookie
  if (opts.body !== undefined) headers['content-type'] = 'application/json'

  const res = await app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  )

  const text = await res.clone().text()
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T, res }
}

export async function signup(username = uniqueUsername()): Promise<Agent> {
  const { status, body, res } = await call<{ id: number }>('POST', '/api/auth/signup', {
    body: { username, password: TEST_PASSWORD },
  })
  if (status !== 200) throw new Error(`signup failed: ${status}`)
  return { userId: body.id, username, password: TEST_PASSWORD, cookie: `sid=${sidFrom(res)}` }
}
