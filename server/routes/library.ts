import { Hono } from 'hono'
import type { Context } from 'hono'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { chapters, db, projects } from '../db'
import { type Variables, authMiddleware } from '../middleware'
import { MAX_TEXT_CHARS } from '../limits'
import { type LanguageCode, isLanguageCode } from '../../src/languages'

// Owns both /api/projects/* and /api/chapters/*, so it mounts at the root of /api — the same
// reason routes/auth.ts does. Keeping them together also keeps the two ownership helpers,
// which every handler here needs, in one place.
const library = new Hono<{ Variables: Variables }>()

const PROJECT_TYPES = ['series', 'oneshot'] as const
type ProjectType = (typeof PROJECT_TYPES)[number]

const MAX_TITLE_CHARS = 200

function readId(c: Context): number | null {
  const id = Number(c.req.param('id'))
  return Number.isInteger(id) && id > 0 ? id : null
}

function readTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = value.trim()
  if (!title || title.length > MAX_TITLE_CHARS) return null
  return title
}

// A row belonging to somebody else is reported as missing rather than forbidden: a stranger's
// ids should not be confirmable by probing.
function ownedProject(id: number, userId: number) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.user_id, userId)))
    .get()
}

// Chapters are owned transitively, so reaching one always means joining back up to its project.
function ownedChapter(id: number, userId: number) {
  return db
    .select({ chapter: chapters, project: projects })
    .from(chapters)
    .innerJoin(projects, eq(chapters.project_id, projects.id))
    .where(and(eq(chapters.id, id), eq(projects.user_id, userId)))
    .get()
}

function touchProject(id: number, now: number) {
  db.update(projects).set({ updated_at: now }).where(eq(projects.id, id)).run()
}

// The list shape. `entry_chapter_id` is the one-shot's single chapter, so the client can link
// straight into the editor without a second request; a series has no single entry point.
function listProjects(userId: number) {
  return db
    .select({
      id: projects.id,
      title: projects.title,
      type: projects.type,
      source_lang: projects.source_lang,
      target_lang: projects.target_lang,
      updated_at: projects.updated_at,
      chapter_count: sql<number>`count(${chapters.id})`,
      entry_chapter_id: sql<number | null>`min(${chapters.id})`,
    })
    .from(projects)
    .leftJoin(chapters, eq(chapters.project_id, projects.id))
    .where(eq(projects.user_id, userId))
    .groupBy(projects.id)
    // Id breaks the tie: two projects made in the same millisecond would otherwise shuffle.
    .orderBy(desc(projects.updated_at), desc(projects.id))
    .all()
    .map(row => ({ ...row, entry_chapter_id: row.type === 'oneshot' ? row.entry_chapter_id : null }))
}

library.get('/projects', authMiddleware, c => {
  return c.json(listProjects(c.get('userId')))
})

library.post('/projects', authMiddleware, async c => {
  const body = await c.req.json().catch(() => ({}))
  const title = readTitle(body.title)
  if (!title) return c.json({ error: `Give it a title, at most ${MAX_TITLE_CHARS} characters` }, 400)
  if (!PROJECT_TYPES.includes(body.type)) {
    return c.json({ error: 'Pick a type: a series, or a one-shot' }, 400)
  }
  const type = body.type as ProjectType

  // The pair is the project's identity, so it is required here and refused everywhere else.
  if (!isLanguageCode(body.source_lang) || !isLanguageCode(body.target_lang)) {
    return c.json({ error: 'Pick a language to translate from, and one to translate into' }, 400)
  }
  if (body.source_lang === body.target_lang) {
    return c.json({ error: 'The two languages must be different' }, 400)
  }
  const source_lang = body.source_lang as LanguageCode
  const target_lang = body.target_lang as LanguageCode

  const now = Date.now()
  const userId = c.get('userId')

  // The one-shot and its chapter are one thing to a reader, so they are one write here: a
  // one-shot with no chapter would have nowhere to open.
  const project = db.transaction(tx => {
    const row = tx
      .insert(projects)
      .values({ user_id: userId, title, type, source_lang, target_lang, created_at: now, updated_at: now })
      .returning()
      .get()

    if (type === 'oneshot') {
      tx.insert(chapters)
        .values({ project_id: row.id, title, position: 0, created_at: now, updated_at: now })
        .run()
    }

    return row
  })

  const entry = db
    .select({ id: chapters.id })
    .from(chapters)
    .where(eq(chapters.project_id, project.id))
    .get()

  return c.json({
    id: project.id,
    title: project.title,
    type: project.type,
    source_lang: project.source_lang,
    target_lang: project.target_lang,
    updated_at: project.updated_at,
    chapter_count: type === 'oneshot' ? 1 : 0,
    entry_chapter_id: type === 'oneshot' ? (entry?.id ?? null) : null,
  })
})

// Stubs only: the chapter list and the sidebar need titles and order, never the bodies.
library.get('/projects/:id', authMiddleware, c => {
  const id = readId(c)
  const project = id === null ? undefined : ownedProject(id, c.get('userId'))
  if (!project) return c.json({ error: 'Project not found' }, 404)

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
    id: project.id,
    title: project.title,
    type: project.type,
    source_lang: project.source_lang,
    target_lang: project.target_lang,
    updated_at: project.updated_at,
    chapters: rows.map(row => ({ ...row, has_translation: row.has_translation > 0 })),
  })
})

library.patch('/projects/:id', authMiddleware, async c => {
  const id = readId(c)
  const project = id === null ? undefined : ownedProject(id, c.get('userId'))
  if (!project) return c.json({ error: 'Project not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  // Refused loudly rather than ignored quietly: the type decides whether the project has
  // chapters at all, so a caller that thinks it changed one has been badly misled.
  if ('type' in body) return c.json({ error: "A project's type cannot be changed" }, 400)
  // Same for the pair, and for a related reason: chapters already translated sit in the old
  // target language, so a project that changed its mind would hold a mixed library.
  if ('source_lang' in body || 'target_lang' in body) {
    return c.json({ error: "A project's languages cannot be changed" }, 400)
  }

  const title = readTitle(body.title)
  if (!title) return c.json({ error: `Give it a title, at most ${MAX_TITLE_CHARS} characters` }, 400)

  const now = Date.now()
  db.update(projects).set({ title, updated_at: now }).where(eq(projects.id, project.id)).run()
  // A one-shot and its chapter are the same document to the reader; let the names not drift.
  if (project.type === 'oneshot') {
    db.update(chapters).set({ title, updated_at: now }).where(eq(chapters.project_id, project.id)).run()
  }

  return c.json({
    id: project.id,
    title,
    type: project.type,
    source_lang: project.source_lang,
    target_lang: project.target_lang,
    updated_at: now,
  })
})

library.delete('/projects/:id', authMiddleware, c => {
  const id = readId(c)
  const project = id === null ? undefined : ownedProject(id, c.get('userId'))
  if (!project) return c.json({ error: 'Project not found' }, 404)

  // Chapters go with it through the foreign key; db.ts turns cascades on.
  db.delete(projects).where(eq(projects.id, project.id)).run()
  return new Response(null, { status: 204 })
})

library.post('/projects/:id/chapters', authMiddleware, async c => {
  const id = readId(c)
  const project = id === null ? undefined : ownedProject(id, c.get('userId'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (project.type === 'oneshot') {
    return c.json({ error: 'A one-shot holds a single document — create a new project instead' }, 400)
  }

  const body = await c.req.json().catch(() => ({}))
  // Untitled is the normal case: the client shows "Chapter N" from the row's place in the list.
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

library.get('/chapters/:id', authMiddleware, c => {
  const id = readId(c)
  const owned = id === null ? undefined : ownedChapter(id, c.get('userId'))
  if (!owned) return c.json({ error: 'Chapter not found' }, 404)

  const { chapter, project } = owned
  return c.json({
    id: chapter.id,
    title: chapter.title,
    position: chapter.position,
    source_text: chapter.source_text,
    translated_text: chapter.translated_text,
    updated_at: chapter.updated_at,
    // The pair rides along because the editor needs it twice over: to name its second tab, and
    // to tell the (chapter-blind) translate route what to translate between.
    project: {
      id: project.id,
      title: project.title,
      type: project.type,
      source_lang: project.source_lang,
      target_lang: project.target_lang,
    },
  })
})

// Save. Only the keys present are written, so the editor can save a title without shipping the
// whole body back, and a rename cannot blank out text.
library.patch('/chapters/:id', authMiddleware, async c => {
  const id = readId(c)
  const owned = id === null ? undefined : ownedChapter(id, c.get('userId'))
  if (!owned) return c.json({ error: 'Chapter not found' }, 404)
  const { chapter, project } = owned

  const body = await c.req.json().catch(() => ({}))
  const patch: { title?: string; source_text?: string; translated_text?: string } = {}

  if ('title' in body) {
    if (typeof body.title !== 'string') return c.json({ error: 'Title must be text' }, 400)
    patch.title = body.title.trim().slice(0, MAX_TITLE_CHARS)
  }
  if ('source_text' in body) {
    if (typeof body.source_text !== 'string') return c.json({ error: 'Source text must be text' }, 400)
    // The same ceiling the translate route enforces: a chapter that saves but can never be
    // translated would be a trap.
    if (body.source_text.length > MAX_TEXT_CHARS) {
      return c.json({ error: `The original must be at most ${MAX_TEXT_CHARS} characters` }, 400)
    }
    patch.source_text = body.source_text
  }
  if ('translated_text' in body) {
    if (typeof body.translated_text !== 'string') {
      return c.json({ error: 'Translated text must be text' }, 400)
    }
    // Deliberately uncapped: this is work the user already has on screen, and refusing to
    // store it would throw it away.
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

  // Renaming a one-shot's document renames the project it stands for.
  if (project.type === 'oneshot' && patch.title !== undefined) {
    db.update(projects).set({ title: patch.title, updated_at: now }).where(eq(projects.id, project.id)).run()
  } else {
    touchProject(project.id, now)
  }

  return c.json({
    id: updated.id,
    title: updated.title,
    position: updated.position,
    source_text: updated.source_text,
    translated_text: updated.translated_text,
    updated_at: updated.updated_at,
    project: {
      id: project.id,
      title: project.type === 'oneshot' ? updated.title : project.title,
      type: project.type,
      source_lang: project.source_lang,
      target_lang: project.target_lang,
    },
  })
})

library.delete('/chapters/:id', authMiddleware, c => {
  const id = readId(c)
  const owned = id === null ? undefined : ownedChapter(id, c.get('userId'))
  if (!owned) return c.json({ error: 'Chapter not found' }, 404)
  const { chapter, project } = owned

  // A one-shot is its chapter, so there is no state where it has lost one.
  if (project.type === 'oneshot') {
    return c.json({ error: 'Delete the one-shot itself instead' }, 400)
  }

  db.delete(chapters).where(eq(chapters.id, chapter.id)).run()
  touchProject(project.id, Date.now())
  return new Response(null, { status: 204 })
})

export default library
