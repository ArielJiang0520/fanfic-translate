import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { LanguagePair } from '@/components/LanguagePair'
import { ConfirmSheet, PromptSheet, Sheet } from '@/components/Sheet'
import { TopBar, barButton } from '@/components/TopBar'
import { MoreIcon, PlusIcon } from '@/components/icons'
import { chapterName, useCreateChapter, useDeleteProject, useProject, useRenameProject } from '@/queries'

type Modal = 'none' | 'menu' | 'rename' | 'delete' | 'newChapter'

export default function ProjectScreen() {
  const { projectId } = useParams()
  const id = Number(projectId)
  const navigate = useNavigate()
  const { data: project, isPending, error } = useProject(Number.isInteger(id) ? id : undefined)

  const rename = useRenameProject()
  const remove = useDeleteProject()
  const createChapter = useCreateChapter()
  const [modal, setModal] = useState<Modal>('none')

  // A junk id would otherwise leave the query disabled and the screen loading forever.
  if (!Number.isInteger(id)) return <Navigate to="/" replace />

  // A one-shot has no chapter list to show — it *is* its chapter.
  if (project?.type === 'oneshot' && project.chapters[0]) {
    return <Navigate to={`/c/${project.chapters[0].id}`} replace />
  }

  async function handleRename(title: string) {
    if (!title) return
    await rename.mutateAsync({ id, title })
    setModal('none')
  }

  async function handleDelete() {
    await remove.mutateAsync(id)
    setModal('none')
    navigate('/', { replace: true })
  }

  async function handleNewChapter(title: string) {
    const chapter = await createChapter.mutateAsync({ projectId: id, title })
    setModal('none')
    navigate(`/c/${chapter.id}`)
  }

  return (
    <>
      <TopBar
        title={project?.title ?? '…'}
        subtitle={
          project ? (
            <>
              {project.chapters.length} {project.chapters.length === 1 ? 'chapter' : 'chapters'} ·{' '}
              <LanguagePair source={project.source_lang} target={project.target_lang} />
            </>
          ) : undefined
        }
        back="/"
        right={
          <button type="button" onClick={() => setModal('menu')} aria-label="Project options" className={barButton}>
            <MoreIcon />
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isPending && <p className="p-6 text-sm text-neutral-500">Loading…</p>}
        {error && <p className="p-6 text-sm text-red-600">{error.message}</p>}

        {project?.chapters.length === 0 && (
          <p className="p-6 text-center text-sm text-neutral-500">
            No chapters yet. Add the first one below.
          </p>
        )}

        <ul className="divide-y divide-neutral-200">
          {project?.chapters.map((chapter, index) => (
            <li key={chapter.id}>
              <Link to={`/c/${chapter.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-neutral-50">
                <span className="min-w-0 flex-1 truncate text-base">{chapterName(chapter.title, index)}</span>
                {chapter.has_translation && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" aria-label="Translated" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="shrink-0 border-t border-neutral-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setModal('newChapter')}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white"
        >
          <PlusIcon className="h-4 w-4" />
          New chapter
        </button>
      </div>

      <Sheet open={modal === 'menu'} onClose={() => setModal('none')} title={project?.title}>
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setModal('rename')}
            className="min-h-12 rounded-md px-2 text-left text-sm active:bg-neutral-100"
          >
            Rename project
          </button>
          <button
            type="button"
            onClick={() => setModal('delete')}
            className="min-h-12 rounded-md px-2 text-left text-sm text-red-600 active:bg-neutral-100"
          >
            Delete project
          </button>
        </div>
        <p className="mt-2 px-2 text-xs text-neutral-500">
          This is a series translating{' '}
          {project && <LanguagePair source={project.source_lang} target={project.target_lang} labelled />}, and stays
          that way — a project's type and languages are fixed when it is created.
        </p>
      </Sheet>

      <PromptSheet
        open={modal === 'rename'}
        onClose={() => setModal('none')}
        title="Rename project"
        label="Title"
        initialValue={project?.title ?? ''}
        submitLabel="Save"
        busy={rename.isPending}
        onSubmit={handleRename}
      />

      <ConfirmSheet
        open={modal === 'delete'}
        onClose={() => setModal('none')}
        title="Delete project"
        message={`"${project?.title ?? ''}" and all of its chapters will be deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={handleDelete}
      />

      <PromptSheet
        open={modal === 'newChapter'}
        onClose={() => setModal('none')}
        title="New chapter"
        label="Title (optional)"
        placeholder="Leave blank to number it"
        submitLabel="Create"
        busy={createChapter.isPending}
        onSubmit={handleNewChapter}
      />
    </>
  )
}
