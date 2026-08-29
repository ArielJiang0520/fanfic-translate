import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { chapters, db, entities, projects } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { MAX_TEXT_CHARS } from '../../src/limits'
import { readEntities } from '../entities'
import { readInstructions } from '../instructions'
import { type LanguageCode, isLanguageCode } from '../../src/languages'

type Project = typeof projects.$inferSelect
type Chapter = typeof chapters.$inferSelect
type Vars = Variables & { project: Project; chapter: Chapter }

const library = new Hono<{ Variables: Vars }>()

const PROJECT_TYPES = ['series', 'oneshot'] as const
type ProjectType = (typeof PROJECT_TYPES)[number]

const MAX_TITLE_CHARS = 200

function readTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = value.trim()
  if (!title || title.length > MAX_TITLE_CHARS) return null
  return title
}

function ownedProject(id: number, userId: number) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.user_id, userId)))
    .get()
}

function ownedChapter(id: number, userId: number) {
  return db
    .select({ chapter: chapters, project: projects })
    .from(chapters)
    .innerJoin(projects, eq(chapters.project_id, projects.id))
    .where(and(eq(chapters.id, id), eq(projects.user_id, userId)))
    .get()
}

function paramId(c: { req: { param: (k: string) => string | undefined } }): number | null {
  const id = Number(c.req.param('id'))
  return Number.isInteger(id) && id > 0 ? id : null
}

// Somebody else's row reads as missing, not forbidden, so ids are not confirmable by probing.
const requireProject: MiddlewareHandler<{ Variables: Vars }> = async (c, next) => {
  const id = paramId(c)
  const project = id === null ? undefined : ownedProject(id, c.get('userId'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  c.set('project', project)
  await next()
}

const requireChapter: MiddlewareHandler<{ Variables: Vars }> = async (c, next) => {
  const id = paramId(c)
  const owned = id === null ? undefined : ownedChapter(id, c.get('userId'))
  if (!owned) return c.json({ error: 'Chapter not found' }, 404)
  c.set('chapter', owned.chapter)
  c.set('project', owned.project)
  await next()
}

function touchProject(id: number, now: number) {
  db.update(projects).set({ updated_at: now }).where(eq(projects.id, id)).run()
}

function projectEntities(projectId: number) {
  return db
    .select({ source: entities.source, target: entities.target })
    .from(entities)
    .where(eq(entities.project_id, projectId))
    .orderBy(asc(entities.position), asc(entities.id))
    .all()
}

function projectShape(project: Project, title = project.title) {
  return {
    id: project.id,
    title,
    type: project.type,
    source_lang: project.source_lang,
    target_lang: project.target_lang,
    instructions: project.instructions,
  }
}

function chapterProject(project: Project, title = project.title) {
  return { ...projectShape(project, title), entities: projectEntities(project.id) }
}

function chapterShape(chapter: Chapter) {
  return {
    id: chapter.id,
    title: chapter.title,
    position: chapter.position,
    source_text: chapter.source_text,
    translated_text: chapter.translated_text,
    updated_at: chapter.updated_at,
  }
}

function listRow(project: Project, chapter_count: number, entry_chapter_id: number | null) {
  return {
    id: project.id,
    title: project.title,
    type: project.type,
    source_lang: project.source_lang,
    target_lang: project.target_lang,
    updated_at: project.updated_at,
    chapter_count,
    entry_chapter_id: project.type === 'oneshot' ? entry_chapter_id : null,
  }
}

library.get('/projects', authMiddleware, c => {
  const rows = db
    .select({
      project: projects,
      chapter_count: sql<number>`count(${chapters.id})`,
      entry_chapter_id: sql<number | null>`min(${chapters.id})`,
    })
    .from(projects)
    .leftJoin(chapters, eq(chapters.project_id, projects.id))
    .where(eq(projects.user_id, c.get('userId')))
    .groupBy(projects.id)
    .orderBy(desc(projects.updated_at), desc(projects.id))
    .all()

  return c.json(rows.map(r => listRow(r.project, r.chapter_count, r.entry_chapter_id)))
})

library.post('/projects', authMiddleware, async c => {
  const body = await c.req.json().catch(() => ({}))
  const title = readTitle(body.title)
  if (!title) return c.json({ error: `Give it a title, at most ${MAX_TITLE_CHARS} characters` }, 400)
  if (!PROJECT_TYPES.includes(body.type)) {
    return c.json({ error: 'Pick a type: a series, or a one-shot' }, 400)
  }
  const type = body.type as ProjectType

  if (!isLanguageCode(body.source_lang) || !isLanguageCode(body.target_lang)) {
    return c.json({ error: 'Pick a language to translate from, and one to translate into' }, 400)
  }
  if (body.source_lang === body.target_lang) {
    return c.json({ error: 'The two languages must be different' }, 400)
  }

  const read = readInstructions(body.instructions)
  if ('error' in read) return c.json({ error: read.error }, 400)

  const now = Date.now()
  const userId = c.get('userId')

  const { project, entryId } = db.transaction(tx => {
    const row = tx
      .insert(projects)
      .values({
        user_id: userId,
        title,
        type,
        source_lang: body.source_lang as LanguageCode,
        target_lang: body.target_lang as LanguageCode,
        instructions: read.instructions,
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get()

    if (type !== 'oneshot') return { project: row, entryId: null }

    const chapter = tx
      .insert(chapters)
      .values({ project_id: row.id, title, position: 0, created_at: now, updated_at: now })
      .returning({ id: chapters.id })
      .get()

    return { project: row, entryId: chapter.id }
  })

  return c.json(listRow(project, type === 'oneshot' ? 1 : 0, entryId))
})

library.get('/projects/:id', authMiddleware, requireProject, c => {
  const project = c.get('project')
  const rows = db
    .select({
      id: chapters.id,
      title: chapters.title,
      position: chapters.position,
      has_translation: sql<number>`length(${chapters.translated_text}) > 0`,
      updated_at: chapters.updated_at,
    })
    .from(chapters)
    .where(eq(chapters.project_id, project.id))
    .orderBy(asc(chapters.position), asc(chapters.id))
    .all()

  return c.json({
    ...projectShape(project),
    updated_at: project.updated_at,
    chapters: rows.map(row => ({ ...row, has_translation: row.has_translation > 0 })),
    entities: projectEntities(project.id),
  })
})

library.patch('/projects/:id', authMiddleware, requireProject, async c => {
  const project = c.get('project')
  const body = await c.req.json().catch(() => ({}))

  if ('type' in body) return c.json({ error: "A project's type cannot be changed" }, 400)
  if ('source_lang' in body || 'target_lang' in body) {
    return c.json({ error: "A project's languages cannot be changed" }, 400)
  }

  const patch: { title?: string; instructions?: string } = {}

  if ('title' in body) {
    const title = readTitle(body.title)
    if (!title) return c.json({ error: `Give it a title, at most ${MAX_TITLE_CHARS} characters` }, 400)
    patch.title = title
  }
  if ('instructions' in body) {
    const read = readInstructions(body.instructions)
    if ('error' in read) return c.json({ error: read.error }, 400)
    patch.instructions = read.instructions
  }

  if (Object.keys(patch).length === 0) return c.json({ error: 'Nothing to save' }, 400)

  const now = Date.now()
  const updated = db
    .update(projects)
    .set({ ...patch, updated_at: now })
    .where(eq(projects.id, project.id))
    .returning()
    .get()

  if (project.type === 'oneshot' && patch.title !== undefined) {
    db.update(chapters)
      .set({ title: patch.title, updated_at: now })
      .where(eq(chapters.project_id, project.id))
      .run()
  }

  return c.json({ ...projectShape(updated), updated_at: updated.updated_at })
})

library.delete('/projects/:id', authMiddleware, requireProject, c => {
  db.delete(projects).where(eq(projects.id, c.get('project').id)).run()
  return new Response(null, { status: 204 })
})

library.put('/projects/:id/entities', authMiddleware, requireProject, async c => {
  const project = c.get('project')
  const body = await c.req.json().catch(() => ({}))
  const read = readEntities(body.entities)
  if ('error' in read) return c.json({ error: read.error }, 400)

  db.transaction(tx => {
    tx.delete(entities).where(eq(entities.project_id, project.id)).run()
    read.entities.forEach((entity, position) => {
      tx.insert(entities).values({ project_id: project.id, ...entity, position }).run()
    })
  })

  touchProject(project.id, Date.now())
  return c.json({ entities: read.entities })
})

library.post('/projects/:id/chapters', authMiddleware, requireProject, async c => {
  const project = c.get('project')
  if (project.type === 'oneshot') {
    return c.json({ error: 'A one-shot holds a single document — create a new project instead' }, 400)
  }

  const body = await c.req.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE_CHARS) : ''

  const last = db
    .select({ position: sql<number | null>`max(${chapters.position})` })
    .from(chapters)
    .where(eq(chapters.project_id, project.id))
    .get()

  const now = Date.now()
  const chapter = db
    .insert(chapters)
    .values({
      project_id: project.id,
      title,
      position: (last?.position ?? -1) + 1,
      created_at: now,
      updated_at: now,
    })
    .returning()
    .get()

  touchProject(project.id, now)
  return c.json({ id: chapter.id, title: chapter.title, position: chapter.position, has_translation: false })
})

library.get('/chapters/:id', authMiddleware, requireChapter, c => {
  return c.json({ ...chapterShape(c.get('chapter')), project: chapterProject(c.get('project')) })
})

library.patch('/chapters/:id', authMiddleware, requireChapter, async c => {
  const chapter = c.get('chapter')
  const project = c.get('project')

  const body = await c.req.json().catch(() => ({}))
  const patch: { title?: string; source_text?: string; translated_text?: string } = {}

  if ('title' in body) {
    if (typeof body.title !== 'string') return c.json({ error: 'Title must be text' }, 400)
    patch.title = body.title.trim().slice(0, MAX_TITLE_CHARS)
  }
  if ('source_text' in body) {
    if (typeof body.source_text !== 'string') return c.json({ error: 'Source text must be text' }, 400)
    if (body.source_text.length > MAX_TEXT_CHARS) {
      return c.json({ error: `The original must be at most ${MAX_TEXT_CHARS} characters` }, 400)
    }
    patch.source_text = body.source_text
  }
  if ('translated_text' in body) {
    if (typeof body.translated_text !== 'string') {
      return c.json({ error: 'Translated text must be text' }, 400)
    }
    patch.translated_text = body.translated_text
  }

  if (Object.keys(patch).length === 0) return c.json({ error: 'Nothing to save' }, 400)

  const now = Date.now()
  const updated = db
    .update(chapters)
    .set({ ...patch, updated_at: now })
    .where(eq(chapters.id, chapter.id))
    .returning()
    .get()

  const renamedOneshot = project.type === 'oneshot' && patch.title !== undefined
  if (renamedOneshot) {
    db.update(projects).set({ title: updated.title, updated_at: now }).where(eq(projects.id, project.id)).run()
  } else {
    touchProject(project.id, now)
  }

  return c.json({
    ...chapterShape(updated),
    project: chapterProject(project, renamedOneshot ? updated.title : project.title),
  })
})

library.delete('/chapters/:id', authMiddleware, requireChapter, c => {
  const project = c.get('project')
  if (project.type === 'oneshot') {
    return c.json({ error: 'Delete the one-shot itself instead' }, 400)
  }

  db.delete(chapters).where(eq(chapters.id, c.get('chapter').id)).run()
  touchProject(project.id, Date.now())
  return new Response(null, { status: 204 })
})

export default library
