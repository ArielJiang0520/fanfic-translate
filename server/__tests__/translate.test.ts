import { describe, expect, test } from 'bun:test'
import { call, signup } from './helpers'

const PAIR = { source_lang: 'en', target_lang: 'es' }

describe('POST /api/translate', () => {
  test('401s without a session', async () => {
    expect((await call('POST', '/api/translate', { body: { text: 'hello', ...PAIR } })).status).toBe(401)
  })

  test('rejects a body it cannot accept', async () => {
    const agent = await signup()
    const bad: [Record<string, unknown>, string][] = [
      [{ text: '   ', ...PAIR }, 'Text required'],
      [{ text: 'a'.repeat(20_001), ...PAIR }, 'at most'],
      [{ text: 'hello' }, 'Unsupported language'],
      [{ text: 'hello', source_lang: 'en', target_lang: 'elvish' }, 'Unsupported language'],
      [{ text: 'hello', ...PAIR, entities: '安娜' }, 'Entities must be a list'],
      [{ text: 'hello', ...PAIR, entities: ['安娜'] }, 'Each entry is an original and a translation'],
      [{ text: 'hello', ...PAIR, entities: [{ source: 'Hydra' }] }, 'Every entry needs a translation'],
      [{ text: 'hello', ...PAIR, entities: [{ target: 'a'.repeat(101) }] }, 'at most'],
      [{ text: 'hello', ...PAIR, instructions: 7 }, 'Instructions'],
      [{ text: 'hello', ...PAIR, instructions: { note: 'hi' } }, 'Instructions'],
      [{ text: 'hello', ...PAIR, instructions: 'a'.repeat(2_001) }, 'Instructions'],
    ]

    for (const [body, error] of bad) {
      const res = await call('POST', '/api/translate', { agent, body })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain(error)
    }
  })

  // Past every guard with no glossary and no instructions, which is the normal case. The suite
  // never calls OpenRouter, so an unset key is how far it can follow the request.
  test('accepts a request that names no glossary and no instructions', async () => {
    const agent = await signup()
    const key = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = ''
    try {
      const { status, body } = await call('POST', '/api/translate', { agent, body: { text: 'hello', ...PAIR } })
      expect(status).toBe(500)
      expect(body.error).toContain('OPENROUTER_API_KEY')
    } finally {
      if (key === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = key
    }
  })
})
