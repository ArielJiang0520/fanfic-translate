import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type Variables, authMiddleware } from '../middleware'
import { MAX_TEXT_CHARS } from '../../src/limits'
import { type Entity, readEntities } from '../entities'
import { readInstructions } from '../instructions'
import { readServerSentEvents } from '../../src/utils/sse'
import { isLanguageCode, language } from '../../src/languages'

const translate = new Hono<{ Variables: Variables }>()

const MODEL = 'deepseek/deepseek-v4-pro'

function glossary(entities: Entity[]): string {
  const pairs = entities.filter(entity => entity.source)
  const bare = entities.filter(entity => !entity.source)

  const lines: string[] = []
  if (pairs.length) {
    lines.push('Render these names and terms exactly as given:')
    lines.push(...pairs.map(entity => `- ${entity.source} → ${entity.target}`))
  }
  if (bare.length) {
    lines.push(`Use these spellings for names and terms when they come up: ${bare.map(entity => entity.target).join(', ')}`)
  }
  return lines.join('\n')
}

translate.post('/', authMiddleware, async c => {
  const { text, source_lang, target_lang, entities, instructions } = await c.req.json().catch(() => ({}))
  const input = typeof text === 'string' ? text.trim() : ''
  if (!input) return c.json({ error: 'Text required' }, 400)
  if (input.length > MAX_TEXT_CHARS) {
    return c.json({ error: `Text must be at most ${MAX_TEXT_CHARS} characters` }, 400)
  }
  if (!isLanguageCode(source_lang) || !isLanguageCode(target_lang)) {
    return c.json({ error: 'Unsupported language' }, 400)
  }
  const read = readEntities(entities ?? [])
  if ('error' in read) return c.json({ error: read.error }, 400)

  const note = readInstructions(instructions)
  if ('error' in note) return c.json({ error: note.error }, 400)

  const systemPrompt = [
    `Translate the input from ${language(source_lang).name} to ${language(target_lang).name}.`,
    note.instructions && `How the translator wants this rendered:\n${note.instructions}`,
    glossary(read.entities),
  ]
    .filter(Boolean)
    .join('\n\n')

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  return streamSSE(c, async stream => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    c.req.raw.signal.addEventListener('abort', abort, { once: true })

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          reasoning: { effort: 'none' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input },
          ],
        }),
      })

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '')
        console.error('[OpenRouter translate error]', { status: response.status, detail })
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: `Translation failed (${response.status})` }),
        })
        return
      }

      for await (const data of readServerSentEvents(response.body)) {
        if (data === '[DONE]') break
        try {
          const parsed = JSON.parse(data)

          if (parsed?.error) {
            console.error('[OpenRouter translate stream error]', parsed.error)
            await stream.writeSSE({
              data: JSON.stringify({ type: 'error', message: parsed.error?.message ?? 'Translation failed' }),
            })
            return
          }

          const content = parsed?.choices?.[0]?.delta?.content
          if (content) await stream.writeSSE({ data: JSON.stringify({ type: 'chunk', content }) })
        } catch {
          // OpenRouter interleaves keep-alive comments and partial frames; neither is a delta.
        }
      }

      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
    } catch (err) {
      if (controller.signal.aborted) return
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[translate]', message)
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message }) })
    } finally {
      c.req.raw.signal.removeEventListener('abort', abort)
    }
  })
})

export default translate
