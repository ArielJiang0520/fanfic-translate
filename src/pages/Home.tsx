import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'

export default function Home() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ ok: boolean }>('/health'),
  })

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold">fanfic-translate</h1>
      <p className="text-sm text-neutral-500">
        api: {isPending ? 'checking…' : isError ? 'unreachable' : data?.ok ? 'ok' : 'unexpected response'}
      </p>
    </main>
  )
}
