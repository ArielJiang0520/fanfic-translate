import { useState, type FormEvent } from 'react'
import { useAuth } from '@/auth'

const MIN_PASSWORD_LENGTH = 8

export default function Login() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }

    setBusy(true)
    try {
      if (isSignup) await signup(username, password)
      else await login(username, password)
      // No navigate: the router shows the app as soon as `user` is set.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: 'login' | 'signup') {
    setMode(next)
    setError('')
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">fanfic-translate</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isSignup ? 'Create an account to get started.' : 'Sign in to translate.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">Username</span>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? '…' : isSignup ? 'Sign up' : 'Log in'}
        </button>
      </form>

      <p className="text-sm text-neutral-500">
        {isSignup ? 'Already have an account? ' : 'No account yet? '}
        <button
          type="button"
          onClick={() => switchMode(isSignup ? 'login' : 'signup')}
          className="font-medium text-neutral-900 underline underline-offset-2"
        >
          {isSignup ? 'Log in' : 'Sign up'}
        </button>
      </p>
    </main>
  )
}
