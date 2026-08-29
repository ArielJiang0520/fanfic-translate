import { useEffect, useRef, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { MAX_INSTRUCTIONS_CHARS } from '@/limits'
import { useProject, useSaveProject } from '@/queries'

export function InstructionsSheet({
  open,
  onClose,
  projectId,
}: {
  open: boolean
  onClose: () => void
  projectId: number | undefined
}) {
  const { data: project } = useProject(open ? projectId : undefined)
  const saveProject = useSaveProject()

  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const seeded = useRef(false)

  useEffect(() => {
    if (!open) {
      seeded.current = false
      return
    }
    if (seeded.current || !project) return
    seeded.current = true
    setValue(project.instructions)
    setError('')
  }, [open, project])

  const tooLong = value.trim().length > MAX_INSTRUCTIONS_CHARS

  async function handleSave() {
    if (projectId === undefined || tooLong) return

    setError('')
    try {
      await saveProject.mutateAsync({ id: projectId, instructions: value })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the instructions')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Instructions">
      <p className="mb-3 text-xs text-neutral-500">
        Anything you want the translation to know, in your own words — who calls whom what, how
        formal it should sound, what to do with honorifics. Used by every chapter here, and by the
        next translation only: nothing already translated is rewritten.
      </p>

      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        rows={6}
        placeholder="Steve calls Bucky 巴基, never 巴恩斯. Keep the narration casual."
        aria-label="Instructions"
        // Anything under 16px makes iOS Safari zoom the page on focus.
        className="mb-2 w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-base leading-relaxed outline-none focus:border-neutral-900"
      />

      <p className={`mb-3 text-right text-xs ${tooLong ? 'text-red-600' : 'text-neutral-400'}`}>
        {value.trim().length} / {MAX_INSTRUCTIONS_CHARS}
      </p>

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
          disabled={!project || tooLong || saveProject.isPending}
          className="min-h-11 flex-1 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {saveProject.isPending ? '…' : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}
