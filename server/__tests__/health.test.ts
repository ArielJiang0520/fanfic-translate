import { expect, test } from 'bun:test'
import { app } from '../index'

test('GET /api/health', async () => {
  const res = await app.fetch(new Request('http://localhost/api/health'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})
