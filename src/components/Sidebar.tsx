import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth'
import { ChevronRightIcon, PlusIcon } from '@/components/icons'
import { NewProjectSheet } from '@/components/NewProjectSheet'
import { PromptSheet } from '@/components/Sheet'
import {
  chapterName,
  projectHref,
  useChapter,
  useCreateChapter,
  useProject,
  useProjects,
  type ProjectSummary,
} from '@/queries'

const row = 'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm'
const activeRow = 'bg-neutral-100 font-medium'

function matchId(pathname: string, pattern: RegExp): number | undefined {
  const found = pathname.match(pattern)
  return found ? Number(found[1]) : undefined
}

function SeriesGroup({
  project,
  expanded,
  onToggle,
  onAddChapter,
  onNavigate,
}: {
  project: ProjectSummary
  expanded: boolean
  onToggle: () => void
  onAddChapter: () => void
  onNavigate: () => void
}) {
  // Deferred until the group is opened: a library of twenty series should not fetch twenty
  // chapter lists to draw a sidebar.
  const { data, isPending } = useProject(expanded ? project.id : undefined)

  return (
    <li>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${project.title}` : `Expand ${project.title}`}
          className="flex h-11 w-8 shrink-0 items-center justify-center text-neutral-400"
        >
          <ChevronRightIcon className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
        <NavLink
          to={`/p/${project.id}`}
          onClick={onNavigate}
          className={({ isActive }) => `${row} min-w-0 flex-1 ${isActive ? activeRow : ''}`}
        >
          <span className="truncate">{project.title}</span>
          <span className="ml-auto shrink-0 text-xs text-neutral-400">{project.chapter_count}</span>
        </NavLink>
      </div>

      {expanded && (
        <ul className="mb-1 ml-8 border-l border-neutral-200 pl-1">
          {isPending && <li className="px-3 py-2 text-xs text-neutral-400">Loading…</li>}
          {data?.chapters.map((chapter, index) => (
            <li key={chapter.id}>
              <NavLink
                to={`/c/${chapter.id}`}
                onClick={onNavigate}
                className={({ isActive }) => `${row} ${isActive ? activeRow : ''}`}
              >
                <span className="truncate">{chapterName(chapter.title, index)}</span>
                {chapter.has_translation && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" aria-label="Translated" />
                )}
              </NavLink>
            </li>
          ))}
          {data && data.chapters.length === 0 && (
            <li className="px-3 py-2 text-xs text-neutral-400">No chapters yet</li>
          )}
          <li>
            <button type="button" onClick={onAddChapter} className={`${row} text-neutral-500`}>
              <PlusIcon className="h-4 w-4" />
              New chapter
            </button>
          </li>
        </ul>
      )}
    </li>
  )
}

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data: projects, isPending } = useProjects()
  const createChapter = useCreateChapter()

  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [addChapterTo, setAddChapterTo] = useState<number | null>(null)

  // Whichever chapter is open, its series should already be unfolded when the drawer appears.
  const openChapterId = matchId(pathname, /^\/c\/(\d+)$/)
  const openChapter = useChapter(openChapterId)
  const activeProjectId = openChapter.data?.project.id ?? matchId(pathname, /^\/p\/(\d+)$/)

  useEffect(() => {
    if (activeProjectId === undefined) return
    setExpanded(prev => (prev.has(activeProjectId) ? prev : new Set(prev).add(activeProjectId)))
  }, [activeProjectId])

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function handleAddChapter(title: string) {
    if (addChapterTo === null) return
    const chapter = await createChapter.mutateAsync({ projectId: addChapterTo, title })
    setAddChapterTo(null)
    onNavigate()
    navigate(`/c/${chapter.id}`)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h2 className="text-base font-semibold">fanfic-translate</h2>
      </div>

      <div className="shrink-0 px-2 pb-2">
        <button
          type="button"
          onClick={() => setNewProjectOpen(true)}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white"
        >
          <PlusIcon className="h-4 w-4" />
          New project
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {isPending && <p className="px-3 py-2 text-sm text-neutral-400">Loading…</p>}
        {projects && projects.length === 0 && (
          <p className="px-3 py-2 text-sm text-neutral-400">Nothing here yet.</p>
        )}
        <ul>
          {projects?.map(project =>
            project.type === 'series' ? (
              <SeriesGroup
                key={project.id}
                project={project}
                expanded={expanded.has(project.id)}
                onToggle={() => toggle(project.id)}
                onAddChapter={() => setAddChapterTo(project.id)}
                onNavigate={onNavigate}
              />
            ) : (
              // A one-shot is its document, so it is a leaf that opens the editor directly.
              // The indent sits on the item, not the row: `ml-8` on a `w-full` row would push
              // the whole drawer sideways.
              <li key={project.id} className="ml-8">
                <NavLink
                  to={projectHref(project)}
                  onClick={onNavigate}
                  className={({ isActive }) => `${row} ${isActive ? activeRow : ''}`}
                >
                  <span className="truncate">{project.title}</span>
                </NavLink>
              </li>
            ),
          )}
        </ul>
      </nav>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm text-neutral-500">
        <span className="truncate">{user?.username}</span>
        <button onClick={logout} className="shrink-0 underline underline-offset-2 hover:text-neutral-900">
          Log out
        </button>
      </div>

      <NewProjectSheet open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
      <PromptSheet
        open={addChapterTo !== null}
        onClose={() => setAddChapterTo(null)}
        title="New chapter"
        label="Title (optional)"
        placeholder="Leave blank to number it"
        submitLabel="Create"
        busy={createChapter.isPending}
        onSubmit={handleAddChapter}
      />
    </div>
  )
}
