import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sheet } from '@/components/Sheet'
import { LanguagePair } from '@/components/LanguagePair'
import { FlagIcon } from '@/components/flags'
import { MAX_INSTRUCTIONS_CHARS } from '@/limits'
import {
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  LANGUAGES,
  type LanguageCode,
} from '@/languages'
import { projectHref, useCreateProject, type ProjectType } from '@/queries'

const TYPES: { value: ProjectType; label: string; hint: string }[] = [
  { value: 'series', label: 'Series', hint: 'Many chapters, in order' },
  { value: 'oneshot', label: 'One-shot', hint: 'A single standalone piece' },
]

function LanguageSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: LanguageCode
  onChange: (code: LanguageCode) => void
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
      <span className="text-neutral-600">{label}</span>
      <span className="flex min-h-11 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 focus-within:border-neutral-900">
        <FlagIcon code={value} />
        <select
          value={value}
          onChange={e => onChange(e.target.value as LanguageCode)}
          className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none"
        >
          {LANGUAGES.map(option => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}

export function NewProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreateProject()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ProjectType>('series')
  const [source, setSource] = useState<LanguageCode>(DEFAULT_SOURCE_LANG)
  const [target, setTarget] = useState<LanguageCode>(DEFAULT_TARGET_LANG)
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState('')

  const sameLanguage = source === target

  useEffect(() => {
    if (!open) return
    setTitle('')
    setType('series')
    setSource(DEFAULT_SOURCE_LANG)
    setTarget(DEFAULT_TARGET_LANG)
    setInstructions('')
    setError('')
  }, [open])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const name = title.trim()
    if (!name || sameLanguage) return

    setError('')
    try {
      const project = await create.mutateAsync({
        title: name,
        type,
        source_lang: source,
        target_lang: target,
        instructions,
      })
      onClose()
      navigate(projectHref(project))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the project')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New project">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">Title</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Under the Stars"
            autoFocus
            className="rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-neutral-600">Type</span>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                aria-pressed={type === option.value}
                className={`min-h-20 rounded-md border p-3 text-left ${
                  type === option.value
                    ? 'border-neutral-900 bg-neutral-50'
                    : 'border-neutral-300'
                }`}
              >
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <LanguageSelect label="From" value={source} onChange={setSource} />
            <LanguageSelect label="Into" value={target} onChange={setTarget} />
          </div>
          {sameLanguage ? (
            <p className="text-xs text-red-600">Pick two different languages.</p>
          ) : (
            <p className="text-xs text-neutral-500">
              Every chapter here translates{' '}
              <LanguagePair source={source} target={target} labelled />.
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">Instructions (optional)</span>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={3}
            maxLength={MAX_INSTRUCTIONS_CHARS}
            placeholder="Steve calls Bucky 巴基, never 巴恩斯. Keep the narration casual."
            className="resize-none rounded-md border border-neutral-300 px-3 py-2 text-base leading-relaxed outline-none focus:border-neutral-900"
          />
        </label>

        <p className="text-xs text-neutral-500">
          The type and the languages cannot be changed later. The instructions can — they are only
          ever read by the next translation.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

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
            disabled={!title.trim() || sameLanguage || create.isPending}
            className="min-h-11 flex-1 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {create.isPending ? '…' : 'Create'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
