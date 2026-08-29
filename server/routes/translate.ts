import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type Variables, authMiddleware } from '../middleware'
import { MAX_TEXT_CHARS } from '../limits'
import { readServerSentEvents } from '../../src/utils/sse'
import { isLanguageCode, language } from '../../src/languages'

const translate = new Hono<{ Variables: Variables }>()

// DeepSeek V4 Pro, with no `provider` block at all: that is OpenRouter's auto route, which
// picks a provider for the model and falls back on its own if the first one fails.
const MODEL = 'deepseek/deepseek-v4-pro'

// POST rather than GET, so the text travels in a body — which rules out EventSource on the
// client; it reads the stream off fetch() instead (see src/utils/sse.ts).
translate.post('/', authMiddleware, async c => {
  const { text, source_lang, target_lang } = await c.req.json().catch(() => ({}))
  const input = typeof text === 'string' ? text.trim() : ''
  if (!input) return c.json({ error: 'Text required' }, 400)
  if (input.length > MAX_TEXT_CHARS) {
    return c.json({ error: `Text must be at most ${MAX_TEXT_CHARS} characters` }, 400)
  }
  // The route stays chapter-blind: the caller says what to translate between, rather than this
  // handler looking a project up. That is what keeps it a pure text-in, text-out endpoint.
  if (!isLanguageCode(source_lang) || !isLanguageCode(target_lang)) {
    return c.json({ error: 'Unsupported language' }, 400)
  }

  // Still one line, as it should stay — only the two nouns are no longer baked in.
  const systemPrompt = `Translate the input from ${language(source_lang).name} to ${language(target_lang).name}.`

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENROUTER_API_KEY is not set on the server' }, 500)

  return streamSSE(c, async stream => {
    // The client going away (navigating, hitting clear) should stop us paying for tokens
    // nobody will read, so its disconnect aborts the upstream request.
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
          // OpenRouter interleaves `: OPENROUTER PROCESSING` comments and the odd partial
          // frame; neither is a delta, so drop anything that will not parse.
        }
      }

      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
    } catch (err) {
      // An abort is the client's own doing — there is nobody left to tell.
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
