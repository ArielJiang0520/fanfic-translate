import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon, MenuIcon } from '@/components/icons'
import { useShell } from '@/components/AppShell'

// 44px is the smallest tap target that reliably works with a thumb, so every bar button is one
// even though the glyph inside is 20px.
const tapTarget =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-700 active:bg-neutral-100'

export function TopBar({
  title,
  subtitle,
  back,
  right,
}: {
  title: ReactNode
  // A node, not a string: the screens that carry a language pair put the <LanguagePair /> here.
  subtitle?: ReactNode
  // A path to go back to. Without it the bar shows the drawer button instead.
  back?: string
  right?: ReactNode
}) {
  const navigate = useNavigate()
  const { openDrawer } = useShell()

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-neutral-200 px-1 pt-[env(safe-area-inset-top)]">
      {back === undefined ? (
        <button type="button" onClick={openDrawer} aria-label="Open menu" className={tapTarget}>
          <MenuIcon />
        </button>
      ) : (
        <button type="button" onClick={() => navigate(back)} aria-label="Back" className={tapTarget}>
          <ChevronLeftIcon />
        </button>
      )}

      <div className="min-w-0 flex-1 px-1">
        <div className="truncate text-base font-semibold">{title}</div>
        {subtitle && <div className="truncate text-xs text-neutral-500">{subtitle}</div>}
      </div>

      <div className="flex shrink-0 items-center">{right}</div>
    </header>
  )
}

export const barButton = tapTarget
