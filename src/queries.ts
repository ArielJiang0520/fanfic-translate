import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { LanguageCode } from '@/languages'

export type ProjectType = 'series' | 'oneshot'

// The pair a project translates between, fixed at creation. Every shape the server sends that
// names a project carries it, because the editor needs it to label its pane and to say what the
// translate route should translate between.
export interface LanguagePair {
  source_lang: LanguageCode
  target_lang: LanguageCode
}

export interface ProjectSummary extends LanguagePair {
  id: number
  title: string
  type: ProjectType
  updated_at: number
  chapter_count: number
  // Set only for a one-shot: the single document it stands for, so the list can link
  // straight into the editor.
  entry_chapter_id: number | null
}

export interface ChapterStub {
  id: number
  title: string
  position: number
  has_translation: boolean
  updated_at: number
}

export interface ProjectDetail extends LanguagePair {
  id: number
  title: string
  type: ProjectType
  updated_at: number
  chapters: ChapterStub[]
}

export interface Chapter {
  id: number
  title: string
  position: number
  source_text: string
  translated_text: string
  updated_at: number
  project: LanguagePair & { id: number; title: string; type: ProjectType }
}

export const keys = {
  projects: ['projects'] as const,
  project: (id: number) => ['project', id] as const,
  chapter: (id: number) => ['chapter', id] as const,
}

// Where a project opens. A one-shot is its document, so it skips the chapter list entirely.
export function projectHref(project: Pick<ProjectSummary, 'id' | 'type' | 'entry_chapter_id'>) {
  if (project.type === 'oneshot' && project.entry_chapter_id !== null) {
    return `/c/${project.entry_chapter_id}`
  }
  return `/p/${project.id}`
}

// A blank title is normal; a chapter is then named by where it sits in its series.
export function chapterName(title: string, index: number) {
  return title.trim() || `Chapter ${index + 1}`
}

export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: () => api<ProjectSummary[]>('/projects') })
}

// `undefined` leaves the query idle, which is how the sidebar defers a series' chapters until
// somebody actually expands it.
export function useProject(id: number | undefined) {
  return useQuery({
    queryKey: keys.project(id!),
    queryFn: () => api<ProjectDetail>(`/projects/${id}`),
    enabled: id !== undefined,
  })
}

export function useChapter(id: number | undefined) {
  return useQuery({
    queryKey: keys.chapter(id!),
    queryFn: () => api<Chapter>(`/chapters/${id}`),
    enabled: id !== undefined,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LanguagePair & { title: string; type: ProjectType }) =>
      api<ProjectSummary>('/projects', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  })
}

export function useRenameProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; title: string }) =>
      api<ProjectDetail>(`/projects/${input.id}`, { method: 'PATCH', body: { title: input.title } }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.project(input.id) })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.removeQueries({ queryKey: keys.project(id) })
    },
  })
}

export function useCreateChapter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { projectId: number; title?: string }) =>
      api<ChapterStub>(`/projects/${input.projectId}/chapters`, {
        method: 'POST',
        body: { title: input.title ?? '' },
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.project(input.projectId) })
    },
  })
}

// Save. Only the fields passed are written, so a rename cannot blank out the text.
export function useSaveChapter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; title?: string; source_text?: string; translated_text?: string }) => {
      const { id, ...patch } = input
      return api<Chapter>(`/chapters/${id}`, { method: 'PATCH', body: patch })
    },
    onSuccess: chapter => {
      qc.setQueryData(keys.chapter(chapter.id), chapter)
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.project(chapter.project.id) })
    },
  })
}

export function useDeleteChapter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; projectId: number }) => api(`/chapters/${input.id}`, { method: 'DELETE' }),
    onSuccess: (_data, input) => {
      qc.removeQueries({ queryKey: keys.chapter(input.id) })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.project(input.projectId) })
    },
  })
}
