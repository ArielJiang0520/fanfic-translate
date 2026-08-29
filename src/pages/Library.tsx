import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LanguagePair } from '@/components/LanguagePair'
import { NewProjectSheet } from '@/components/NewProjectSheet'
import { TopBar, barButton } from '@/components/TopBar'
import { PlusIcon } from '@/components/icons'
import { projectHref, useProjects } from '@/queries'
import { relativeTime } from '@/utils/time'

export default function Library() {
  const { data: projects, isPending, error } = useProjects()
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  return (
    <>
      <TopBar
        title="Library"
        right={
          <button
            type="button"
            onClick={() => setNewProjectOpen(true)}
            aria-label="New project"
            className={barButton}
          >
            <PlusIcon />
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isPending && <p className="p-6 text-sm text-neutral-500">Loading…</p>}
        {error && <p className="p-6 text-sm text-red-600">{error.message}</p>}

        {projects && projects.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <div>
              <p className="text-base font-medium">Nothing here yet</p>
              <p className="mt-1 text-sm text-neutral-500">
                Start a series for something with chapters, or a one-shot for a single piece.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewProjectOpen(true)}
              className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white"
            >
              New project
            </button>
          </div>
        )}

        <ul className="divide-y divide-neutral-200">
          {projects?.map(project => (
            <li key={project.id}>
              <Link to={projectHref(project)} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-neutral-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-medium">{project.title}</div>
                  <div className="mt-0.5 truncate text-xs text-neutral-500">
                    {project.type === 'oneshot'
                      ? 'One-shot'
                      : `Series · ${project.chapter_count} ${project.chapter_count === 1 ? 'chapter' : 'chapters'}`}
                    {' · '}
                    <LanguagePair source={project.source_lang} target={project.target_lang} />
                    {' · '}
                    {relativeTime(project.updated_at)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <NewProjectSheet open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
    </>
  )
}
