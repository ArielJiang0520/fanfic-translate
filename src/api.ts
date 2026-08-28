// Every client call goes through here so auth failures and error shapes are handled once.
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  const init: RequestInit = { method: opts.method ?? 'GET', headers, credentials: 'same-origin', signal: opts.signal }

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }

  const res = await fetch(`/api${path}`, init)
  const text = await res.text()
  const body = text ? JSON.parse(text) : null

  if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText)
  return body as T
}
