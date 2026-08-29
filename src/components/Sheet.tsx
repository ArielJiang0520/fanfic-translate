import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

// Every modal in this app is a bottom sheet rather than a centred dialog: on a phone the
// controls then land under the thumb instead of halfway up the screen.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-black/40"
      />
      <div className="relative animate-sheet-in rounded-t-2xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300" />
        {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

// A sheet holding one text field: new chapter, and both renames.
export function PromptSheet({
  open,
  onClose,
  title,
  label,
  initialValue = '',
  placeholder,
  submitLabel,
  busy,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  title: string
  label: string
  initialValue?: string
  placeholder?: string
  submitLabel: string
  busy?: boolean
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reopening on a different row has to start from that row's text, not the last one's.
  useEffect(() => {
    if (open) setValue(initialValue)
  }, [open, initialValue])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(value.trim())
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">{label}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className="rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 flex-1 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? '…' : submitLabel}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

export function ConfirmSheet({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  destructive,
  busy,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  message: string
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="mb-4 text-sm text-neutral-600">{message}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-1 rounded-md border border-neutral-300 px-4 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`min-h-11 flex-1 rounded-md px-4 text-sm font-medium text-white disabled:opacity-50 ${
            destructive ? 'bg-red-600' : 'bg-neutral-900'
          }`}
        >
          {busy ? '…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}
