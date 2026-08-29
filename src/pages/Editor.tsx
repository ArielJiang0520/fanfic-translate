import { useEffect, useRef, useState } from 'react'
import { Navigate, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { ConfirmSheet, PromptSheet, Sheet } from '@/components/Sheet'
import { TopBar, barButton } from '@/components/TopBar'
import { MoreIcon } from '@/components/icons'
import {
  chapterName,
  useChapter,
  useDeleteChapter,
  useDeleteProject,
  useProject,
  useSaveChapter,
} from '@/queries'
import { readServerSentEvents } from '@/utils/sse'

type Tab = 'source' | 'translated'
type Modal = 'none' | 'menu' | 'rename' | 'delete' | 'retranslate'

export default function Editor() {
  const { chapterId } = useParams()
  const id = Number(chapterId)
  const navigate = useNavigate()

  const { data: chapter, isPending, error: loadError } = useChapter(Number.isInteger(id) ? id : undefined)
  // Only to number an untitled chapter within its series; a one-shot borrows the project title.
  const siblings = useProject(chapter?.project.type === 'series' ? chapter.project.id : undefined)

  const save = useSaveChapter()
  const removeChapter = useDeleteChapter()
  const removeProject = useDeleteProject()

  const [tab, setTab] = useState<Tab>('source')
  const [source, setSource] = useState('')
  const [translated, setTranslated] = useState('')
  // What the server last confirmed. Anything different from this is unsaved.
  const [baseline, setBaseline] = useState({ source: '', translated: '' })
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<Modal>('none')

  // Held across renders so Stop can cut a run off mid-stream.
  const abortRef = useRef<AbortController | null>(null)
  const paneRef = useRef<HTMLTextAreaElement>(null)
  const loadedId = useRef<number | null>(null)
  // Deleting is a deliberate exit; the unsaved-changes guard should not argue about it.
  const bypassGuard = useRef(false)

  const dirty = source !== baseline.source || translated !== baseline.translated

  // Seed the editor once per chapter. Keyed on the id rather than the object so a background
  // refetch cannot overwrite what is being typed.
  useEffect(() => {
    if (!chapter || loadedId.current === chapter.id) return
    loadedId.current = chapter.id
    setSource(chapter.source_text)
    setTranslated(chapter.translated_text)
    setBaseline({ source: chapter.source_text, translated: chapter.translated_text })
    setTab(chapter.translated_text ? 'translated' : 'source')
    setError('')
  }, [chapter])

  // Follow the text as it arrives.
  useEffect(() => {
    if (streaming && tab === 'translated' && paneRef.current) {
      paneRef.current.scrollTop = paneRef.current.scrollHeight
    }
  }, [translated, streaming, tab])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // There is no autosave, so leaving with unsaved work has to be a deliberate act.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !bypassGuard.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  )

  async function runTranslate() {
    const text = source.trim()
    if (!text || streaming) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setError('')
    setTranslated('')
    setStreaming(true)
    setTab('translated')

    try {
      // Not the shared `api()` helper: this response is a stream, not JSON, so it has to be
      // read frame by frame rather than parsed whole.
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify({ text }),
      })

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? `Translation failed (${res.status})`)
        return
      }

      for await (const data of readServerSentEvents(res.body)) {
        const event = JSON.parse(data)
        if (event.type === 'chunk') setTranslated(prev => prev + event.content)
        else if (event.type === 'error') setError(event.message)
      }
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setStreaming(false)
      }
    }
  }

  function handleTranslate() {
    // The pane may hold hand-edits, so replacing it is asked about rather than assumed.
    if (translated.trim()) setModal('retranslate')
    else void runTranslate()
  }

  function handleStop() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  async function handleSave() {
    setError('')
    try {
      await save.mutateAsync({ id, source_text: source, translated_text: translated })
      setBaseline({ source, translated })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  async function handleRename(title: string) {
    await save.mutateAsync({ id, title })
    setModal('none')
  }

  async function handleDelete() {
    if (!chapter) return
    bypassGuard.current = true
    if (chapter.project.type === 'oneshot') {
      await removeProject.mutateAsync(chapter.project.id)
      navigate('/', { replace: true })
    } else {
      await removeChapter.mutateAsync({ id, projectId: chapter.project.id })
      navigate(`/p/${chapter.project.id}`, { replace: true })
    }
  }

  // A junk id would otherwise leave the query disabled and the screen loading forever.
  if (!Number.isInteger(id)) return <Navigate to="/" replace />

  const isOneshot = chapter?.project.type === 'oneshot'
  const index = siblings.data?.chapters.findIndex(c => c.id === chapter?.id) ?? -1
  const heading = !chapter
    ? '…'
    : isOneshot
      ? chapter.title.trim() || chapter.project.title
      : index >= 0
        ? chapterName(chapter.title, index)
        : chapter.title.trim() || 'Chapter'

  const backTo = chapter ? (isOneshot ? '/' : `/p/${chapter.project.id}`) : '/'

  if (loadError) {
    return (
      <>
        <TopBar title="Not found" back="/" />
        <div className="min-h-0 flex-1 p-6">
          <p className="text-sm text-red-600">{loadError.message}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <span className="truncate">{heading}</span>
            {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-900" aria-label="Unsaved changes" />}
          </span>
        }
        subtitle={isOneshot ? 'One-shot' : chapter?.project.title}
        back={backTo}
        right={
          <button
            type="button"
            onClick={() => setModal('menu')}
            aria-label="Chapter options"
            disabled={!chapter}
            className={barButton}
          >
            <MoreIcon />
          </button>
        }
      />

      <div className="shrink-0 px-4 pt-3">
        <div className="flex gap-1 rounded-md bg-neutral-100 p-1">
          {(
            [
              ['source', 'Original'],
              ['translated', '译文'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={`min-h-9 flex-1 rounded text-sm font-medium ${
                tab === value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 py-3">
        {isPending ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <textarea
            ref={paneRef}
            key={tab}
            value={tab === 'source' ? source : translated}
            onChange={e => (tab === 'source' ? setSource(e.target.value) : setTranslated(e.target.value))}
            readOnly={tab === 'translated' && streaming}
            placeholder={
              tab === 'source'
                ? 'Paste the text to translate…'
                : streaming
                  ? 'Translating…'
                  : 'Nothing translated yet.'
            }
            // text-base, not smaller: iOS Safari zooms the page on focus for anything under 16px.
            className="h-full w-full resize-none text-base leading-relaxed outline-none"
          />
        )}
      </div>

      {error && <p className="shrink-0 px-4 pb-2 text-sm text-red-600">{error}</p>}

      <div className="shrink-0 border-t border-neutral-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={streaming ? handleStop : handleTranslate}
            disabled={!streaming && !source.trim()}
            className="min-h-11 flex-1 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {streaming ? 'Stop' : translated.trim() ? 'Retranslate' : 'Translate'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || save.isPending || streaming}
            className="min-h-11 rounded-md border border-neutral-300 px-5 text-sm font-medium disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      <Sheet open={modal === 'menu'} onClose={() => setModal('none')} title={heading}>
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setModal('rename')}
            className="min-h-12 rounded-md px-2 text-left text-sm active:bg-neutral-100"
          >
            {isOneshot ? 'Rename one-shot' : 'Rename chapter'}
          </button>
          <button
            type="button"
            onClick={() => setModal('delete')}
            className="min-h-12 rounded-md px-2 text-left text-sm text-red-600 active:bg-neutral-100"
          >
            {isOneshot ? 'Delete one-shot' : 'Delete chapter'}
          </button>
        </div>
      </Sheet>

      <PromptSheet
        open={modal === 'rename'}
        onClose={() => setModal('none')}
        title={isOneshot ? 'Rename one-shot' : 'Rename chapter'}
        label="Title"
        initialValue={chapter?.title ?? ''}
        placeholder={isOneshot ? undefined : 'Leave blank to number it'}
        submitLabel="Save"
        busy={save.isPending}
        onSubmit={handleRename}
      />

      <ConfirmSheet
        open={modal === 'delete'}
        onClose={() => setModal('none')}
        title={isOneshot ? 'Delete one-shot' : 'Delete chapter'}
        message={
          isOneshot
            ? 'The one-shot and its text will be deleted. This cannot be undone.'
            : 'This chapter, its original and its translation will be deleted. This cannot be undone.'
        }
        confirmLabel="Delete"
        destructive
        busy={removeChapter.isPending || removeProject.isPending}
        onConfirm={handleDelete}
      />

      <ConfirmSheet
        open={modal === 'retranslate'}
        onClose={() => setModal('none')}
        title="Replace the translation?"
        message="The current 译文, including anything you edited by hand, will be thrown away and generated again."
        confirmLabel="Retranslate"
        onConfirm={() => {
          setModal('none')
          void runTranslate()
        }}
      />

      <ConfirmSheet
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        message="This chapter has changes that have not been saved."
        confirmLabel="Discard"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  )
}
