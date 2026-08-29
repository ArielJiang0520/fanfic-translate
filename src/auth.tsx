import { createContext, use, useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'

export interface User {
  id: number
  username: string
}

interface AuthCtx {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  signup: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // The `sid` cookie is httpOnly, so the only way to know whether we are signed in is to ask.
  useEffect(() => {
    api<User>('/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const authenticate = useCallback(
    async (path: string, username: string, password: string) => {
      const u = await api<User>(path, { method: 'POST', body: { username, password } })
      queryClient.clear()
      setUser(u)
    },
    [queryClient],
  )

  const login = useCallback((u: string, p: string) => authenticate('/auth/login', u, p), [authenticate])
  const signup = useCallback((u: string, p: string) => authenticate('/auth/signup', u, p), [authenticate])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' })
    queryClient.clear()
    setUser(null)
  }, [queryClient])

  return (
    <AuthContext value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext>
  )
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}
