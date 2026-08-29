import { createContext, use, useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'

interface Shell {
  openDrawer: () => void
}

const ShellContext = createContext<Shell | null>(null)

export function useShell() {
  const ctx = use(ShellContext)
  if (!ctx) throw new Error('useShell must be used inside AppShell')
  return ctx
}

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => setDrawerOpen(false), [pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <ShellContext value={{ openDrawer }}>
      <div className="flex h-dvh flex-col overflow-hidden bg-white text-neutral-900">
        <Outlet />
      </div>

      <button
        type="button"
        aria-label="Close menu"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={closeDrawer}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        aria-hidden={!drawerOpen}
        className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs bg-white transition-transform duration-200 ease-out ${
          drawerOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </aside>
    </ShellContext>
  )
}
