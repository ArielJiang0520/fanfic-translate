import { useEffect, useRef, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { PlusIcon, XIcon } from '@/components/icons'
import { languageName } from '@/languages'
import { type Entity, useProject, useSaveEntities } from '@/queries'

export function EntitiesSheet({
  open,
  onClose,
  projectId,
}: {
  open: boolean
  onClose: () => void
  projectId: number | undefined
}) {
  const { data: project } = useProject(open ? projectId : undefined)
  const saveEntities = useSaveEntities()

  const [rows, setRows] = useState<Entity[]>([])
  const [error, setError] = useState('')
  const seeded = useRef(false)

  useEffect(() => {
    if (!open) {
      seeded.current = false
      return
    }
    if (seeded.current || !project) return
    seeded.current = true
    setRows(project.entities.length ? project.entities : [{ source: '', target: '' }])
    setError('')
  }, [open, project])

  function edit(index: number, patch: Partial<Entity>) {
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function handleSave() {
    if (projectId === undefined) return
    const entities = rows.filter(row => row.source.trim() || row.target.trim())

    setError('')
    try {
      await saveEntities.mutateAsync({ projectId, entities })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the entities')
    }
  }

  const targetName = project ? languageName(project.target_lang) : 'Translation'

  return (
    <Sheet open={open} onClose={onClose} title="Entities">
      <p className="mb-3 text-xs text-neutral-500">
        Names and terms you want translated a particular way, used by every chapter here. The
        original is optional — a {targetName} spelling on its own still tells the translation what
        to call someone.
      </p>

      <div className="mb-3 flex max-h-[50vh] flex-col gap-2 overflow-y-auto overscroll-contain">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <input
              value={row.source}
              onChange={e => edit(index, { source: e.target.value })}
              placeholder="Original"
              aria-label={`Original, entry ${index + 1}`}
              // Anything under 16px makes iOS Safari zoom the page on focus.
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
            />
            <span aria-hidden="true" className="shrink-0 text-sm text-neutral-400">
              →
            </span>
            <input
              value={row.target}
              onChange={e => edit(index, { target: e.target.value })}
              placeholder={targetName}
              aria-label={`${targetName}, entry ${index + 1}`}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
            />
            <button
              type="button"
              onClick={() => setRows(current => current.filter((_, i) => i !== index))}
              aria-label={`Remove entry ${index + 1}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-400 active:bg-neutral-100"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows(current => [...current, { source: '', target: '' }])}
        className="mb-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-neutral-300 px-4 text-sm font-medium"
      >
        <PlusIcon className="h-4 w-4" />
        Add entry
      </button>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

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
          onClick={handleSave}
          disabled={!project || saveEntities.isPending}
          className="min-h-11 flex-1 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {saveEntities.isPending ? '…' : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}
