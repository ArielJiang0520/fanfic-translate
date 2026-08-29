import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth'
import AppShell from '@/components/AppShell'
import Editor from '@/pages/Editor'
import Library from '@/pages/Library'
import Login from '@/pages/Login'
import ProjectScreen from '@/pages/ProjectScreen'

// Every screen waits on the same thing: whether the `sid` cookie resolves to a session. Until
// /me answers, neither redirect is safe — one of them would be wrong.
function Pending() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center justify-center p-6">
      <p className="text-sm text-neutral-500">Loading…</p>
    </main>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Pending />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function LoginRoute() {
  const { user, loading } = useAuth()
  if (loading) return <Pending />
  if (user) return <Navigate to="/" replace />
  return <Login />
}

const router = createBrowserRouter([
  {
    // A layout route, so the drawer and the viewport-owning shell survive navigation between
    // the library, a chapter list and the editor.
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <Library /> },
      { path: '/p/:projectId', element: <ProjectScreen /> },
      { path: '/c/:chapterId', element: <Editor /> },
    ],
  },
  { path: '/login', element: <LoginRoute /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
