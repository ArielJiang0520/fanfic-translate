import { describe, expect, test } from 'bun:test'
import { call, signup } from './helpers'

// The route's own guards, up to the point where it would call OpenRouter — no test here
// reaches the network.
// The route is deliberately chapter-blind, so the caller names the pair on every request.
const PAIR = { source_lang: 'en', target_lang: 'es' }

describe('POST /api/translate', () => {
  test('401s without a session', async () => {
    const { status } = await call('POST', '/api/translate', { body: { text: 'hello', ...PAIR } })
    expect(status).toBe(401)
  })

  test('rejects empty text', async () => {
    const agent = await signup()
    const { status, body } = await call('POST', '/api/translate', { agent, body: { text: '   ', ...PAIR } })
    expect(status).toBe(400)
    expect(body.error).toBe('Text required')
  })

  test('rejects text over the size limit', async () => {
    const agent = await signup()
    const { status, body } = await call('POST', '/api/translate', {
      agent,
      body: { text: 'a'.repeat(20_001), ...PAIR },
    })
    expect(status).toBe(400)
    expect(body.error).toContain('at most')
  })

  test('rejects a request that names no languages', async () => {
    const agent = await signup()
    const { status, body } = await call('POST', '/api/translate', { agent, body: { text: 'hello' } })
    expect(status).toBe(400)
    expect(body.error).toBe('Unsupported language')
  })

  test('rejects a language it does not support', async () => {
    const agent = await signup()
    const { status, body } = await call('POST', '/api/translate', {
      agent,
      body: { text: 'hello', source_lang: 'en', target_lang: 'elvish' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Unsupported language')
  })
})
