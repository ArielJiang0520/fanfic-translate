import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { LanguageCode } from '@/languages'

export type ProjectType = 'series' | 'oneshot'

export interface LanguagePair {
  source_lang: LanguageCode
  target_lang: LanguageCode
}

export interface Entity {
  source: string
  target: string
}

export interface ProjectSummary extends LanguagePair {
  id: number
  title: string
  type: ProjectType
  updated_at: number
  chapter_count: number
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
  instructions: string
  chapters: ChapterStub[]
  entities: Entity[]
}

export interface Chapter {
  id: number
  title: string
  position: number
  source_text: string
  translated_text: string
  updated_at: number
  project: LanguagePair & {
    id: number
    title: string
    type: ProjectType
    instructions: string
    entities: Entity[]
  }
}

export const keys = {
  projects: ['projects'] as const,
  project: (id: number) => ['project', id] as const,
  chapter: (id: number) => ['chapter', id] as const,
}

export function projectHref(project: Pick<ProjectSummary, 'id' | 'type' | 'entry_chapter_id'>) {
  if (project.type === 'oneshot' && project.entry_chapter_id !== null) {
    return `/c/${project.entry_chapter_id}`
  }
  return `/p/${project.id}`
}

export function chapterName(title: string, index: number) {
  return title.trim() || `Chapter ${index + 1}`
}

export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: () => api<ProjectSummary[]>('/projects') })
}

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
    mutationFn: (input: LanguagePair & { title: string; type: ProjectType; instructions?: string }) =>
      api<ProjectSummary>('/projects', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  })
}

export function useSaveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; title?: string; instructions?: string }) => {
      const { id, ...patch } = input
      return api<Omit<ProjectDetail, 'chapters' | 'entities'>>(`/projects/${id}`, {
        method: 'PATCH',
        body: patch,
      })
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.project(input.id) })
      qc.invalidateQueries({ queryKey: ['chapter'] })
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

export function useSaveEntities() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { projectId: number; entities: Entity[] }) =>
      api<{ entities: Entity[] }>(`/projects/${input.projectId}/entities`, {
        method: 'PUT',
        body: { entities: input.entities },
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.project(input.projectId) })
      qc.invalidateQueries({ queryKey: ['chapter'] })
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
