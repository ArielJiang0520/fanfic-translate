// Splits an SSE response body into the raw `data:` payloads, in order. Shared by the server
// (reading OpenRouter) and the client (reading our own /api/translate stream), which is why it
// lives under src/ rather than server/.
export async function* readServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const event of events) {
      const line = event.trim()
      if (line.startsWith('data: ')) yield line.slice(6)
    }
  }
}
