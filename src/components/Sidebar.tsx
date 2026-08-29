import { useAuth } from '@/auth'

export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h2 className="text-base font-semibold">fanfic-translate</h2>
      </div>

      <div className="flex-1" />

      <div className="shrink-0 border-t border-neutral-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="truncate text-sm text-neutral-500">{user?.username}</p>
        <button
          type="button"
          onClick={logout}
          className="mt-2 flex min-h-11 w-full items-center justify-center rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 active:bg-neutral-100"
        >
          Log out
        </button>
      </div>
    </div>
  )
}
