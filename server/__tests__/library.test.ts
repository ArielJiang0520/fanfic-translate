import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { chapters, db, entities, projects } from '../db'
import { type Agent, call, signup } from './helpers'

interface Entity {
  source: string
  target: string
}

interface ChapterStub {
  id: number
  title: string
  position: number
  has_translation: boolean
}

// Every project-shaped response in one type: the list row is the narrowest, the chapter's
// nested project the widest.
interface ProjectRow {
  id: number
  title: string
  type: string
  source_lang: string
  target_lang: string
  updated_at: number
  chapter_count?: number
  entry_chapter_id?: number | null
  instructions?: string
  entities?: Entity[]
  chapters?: ChapterStub[]
}

type Attempt = [method: string, path: string, body?: unknown]

async function newProject(
  agent: Agent,
  type: 'series' | 'oneshot',
  opts: { title?: string; source_lang?: string; target_lang?: string; instructions?: string } = {},
) {
  const { title = `${type} title`, source_lang = 'en', target_lang = 'zh-Hans', instructions } = opts
  const { status, body } = await call<ProjectRow>('POST', '/api/projects', {
    agent,
    body: { title, type, source_lang, target_lang, ...(instructions === undefined ? {} : { instructions }) },
  })
  expect(status).toBe(200)
  return body
}

async function newChapter(agent: Agent, projectId: number, title = '') {
  const { status, body } = await call<ChapterStub>('POST', `/api/projects/${projectId}/chapters`, {
    agent,
    body: { title },
  })
  expect(status).toBe(200)
  return body
}

function putEntities(agent: Agent, projectId: number, list: unknown) {
  return call<{ entities: Entity[]; error: string }>('PUT', `/api/projects/${projectId}/entities`, {
    agent,
    body: { entities: list },
  })
}

const stored = (projectId: number) => db.select().from(projects).where(eq(projects.id, projectId)).get()!
const storedChapters = (projectId: number) => db.select().from(chapters).where(eq(chapters.project_id, projectId)).all()
const storedEntities = (projectId: number) => db.select().from(entities).where(eq(entities.project_id, projectId)).all()

describe('POST /api/projects', () => {
  test('a series starts with no chapters', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', { title: 'Under the Stars' })

    expect(project).toMatchObject({ title: 'Under the Stars', type: 'series', chapter_count: 0, entry_chapter_id: null })
    expect(storedChapters(project.id)).toHaveLength(0)
  })

  test('a one-shot is created with exactly one chapter, ready to open', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot', { title: 'Rainy Night' })

    const rows = storedChapters(project.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!).toMatchObject({ title: 'Rainy Night', position: 0 })
    expect(project).toMatchObject({ chapter_count: 1, entry_chapter_id: rows[0]!.id })
  })

  test('keeps the language pair it was created with', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', { source_lang: 'ja', target_lang: 'ko' })

    expect(project).toMatchObject({ source_lang: 'ja', target_lang: 'ko' })
    expect(stored(project.id)).toMatchObject({ source_lang: 'ja', target_lang: 'ko' })
  })

  test('stores the instructions it was given, and none is the normal case', async () => {
    const agent = await signup()
    const noted = await newProject(agent, 'series', { instructions: '  Keep the narration casual.  ' })
    const plain = await newProject(agent, 'series')

    expect(stored(noted.id).instructions).toBe('Keep the narration casual.')
    expect(stored(plain.id).instructions).toBe('')
  })

  test('rejects a body it cannot accept', async () => {
    const agent = await signup()
    const ok = { title: 'Fine', type: 'series', source_lang: 'en', target_lang: 'zh-Hans' }
    const bad: [Record<string, unknown>, string][] = [
      [{ ...ok, title: '   ' }, 'title'],
      [{ ...ok, title: 'a'.repeat(201) }, 'title'],
      [{ ...ok, type: 'anthology' }, 'type'],
      [{ title: 'Nope', type: 'series' }, 'language'],
      [{ ...ok, target_lang: 'elvish' }, 'language'],
      [{ ...ok, source_lang: 'es', target_lang: 'es' }, 'different'],
      [{ ...ok, instructions: 'a'.repeat(2_001) }, 'Instructions'],
      [{ ...ok, instructions: 7 }, 'Instructions'],
      [{ ...ok, instructions: { note: 'hi' } }, 'Instructions'],
    ]

    for (const [body, error] of bad) {
      const res = await call('POST', '/api/projects', { agent, body })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain(error)
    }
  })
})

describe('GET /api/projects', () => {
  test('lists only the caller’s own projects, newest activity first', async () => {
    const agent = await signup()
    const stranger = await signup()
    const first = await newProject(agent, 'series')
    const second = await newProject(agent, 'oneshot')
    await newProject(stranger, 'series', { title: 'Not mine' })

    const { status, body } = await call<ProjectRow[]>('GET', '/api/projects', { agent })
    expect(status).toBe(200)
    expect(body.map(p => p.id)).toEqual([second.id, first.id])
    expect(body.find(p => p.id === second.id)!.entry_chapter_id).not.toBeNull()
    expect(body.find(p => p.id === first.id)!.entry_chapter_id).toBeNull()
  })

  test('counts a series’ chapters', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    await newChapter(agent, project.id)
    await newChapter(agent, project.id)

    const { body } = await call<ProjectRow[]>('GET', '/api/projects', { agent })
    expect(body.find(p => p.id === project.id)!.chapter_count).toBe(2)
  })
})

describe('GET /api/projects/:id', () => {
  test('returns chapter stubs in position order, without the bodies', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const one = await newChapter(agent, project.id, 'One')
    const two = await newChapter(agent, project.id, 'Two')
    await call('PATCH', `/api/chapters/${two.id}`, { agent, body: { translated_text: '译文' } })

    const { status, body } = await call<ProjectRow>('GET', `/api/projects/${project.id}`, { agent })
    expect(status).toBe(200)
    expect(body.chapters!.map(c => c.id)).toEqual([one.id, two.id])
    expect(body.chapters!.map(c => c.has_translation)).toEqual([false, true])
    expect(body.chapters![0]).not.toHaveProperty('source_text')
    expect(body.chapters![0]).not.toHaveProperty('translated_text')
  })

  test('404s on an id that is not a number', async () => {
    const agent = await signup()
    expect((await call('GET', '/api/projects/abc', { agent })).status).toBe(404)
  })
})

describe('PATCH /api/projects/:id', () => {
  test('renames a series', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', { title: 'Old' })

    const { status, body } = await call('PATCH', `/api/projects/${project.id}`, { agent, body: { title: 'New' } })
    expect(status).toBe(200)
    expect(body.title).toBe('New')
    expect(stored(project.id).title).toBe('New')
  })

  test('renaming a one-shot renames its document too', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot', { title: 'Old' })

    await call('PATCH', `/api/projects/${project.id}`, { agent, body: { title: 'New' } })
    expect(storedChapters(project.id)[0]!.title).toBe('New')
  })

  test('refuses to change the type or the languages, and leaves them alone', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', { source_lang: 'en', target_lang: 'es' })
    const refusals: [Record<string, unknown>, string][] = [
      [{ type: 'oneshot' }, "A project's type cannot be changed"],
      [{ source_lang: 'ja' }, "A project's languages cannot be changed"],
      [{ target_lang: 'ko' }, "A project's languages cannot be changed"],
    ]

    for (const [patch, error] of refusals) {
      const res = await call('PATCH', `/api/projects/${project.id}`, { agent, body: { title: 'Fine', ...patch } })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe(error)
    }

    expect(stored(project.id)).toMatchObject({ type: 'series', source_lang: 'en', target_lang: 'es' })
  })

  test('writes only the keys it was given', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', { title: 'Keep this name' })

    const { status, body } = await call<ProjectRow>('PATCH', `/api/projects/${project.id}`, {
      agent,
      body: { instructions: 'Honorifics stay.' },
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({ title: 'Keep this name', instructions: 'Honorifics stay.' })

    await call('PATCH', `/api/projects/${project.id}`, { agent, body: { title: 'Renamed' } })
    expect(stored(project.id)).toMatchObject({ title: 'Renamed', instructions: 'Honorifics stay.' })
  })

  test('saving a note on a one-shot does not rename its document', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot', { title: 'Rainy Night' })

    await call('PATCH', `/api/projects/${project.id}`, { agent, body: { instructions: 'Casual.' } })
    expect(storedChapters(project.id)[0]!.title).toBe('Rainy Night')
  })

  test('refuses a bad patch, and writes nothing', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', { title: 'Untouched', instructions: 'Original note.' })

    for (const body of [{ instructions: 'a'.repeat(2_001) }, { instructions: 7 }, { title: '  ' }, {}]) {
      expect((await call('PATCH', `/api/projects/${project.id}`, { agent, body })).status).toBe(400)
    }
    expect(stored(project.id)).toMatchObject({ title: 'Untouched', instructions: 'Original note.' })
  })
})

describe('DELETE /api/projects/:id', () => {
  test('takes its chapters and its glossary with it', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    await newChapter(agent, project.id)
    await putEntities(agent, project.id, [{ target: '安娜' }])

    expect((await call('DELETE', `/api/projects/${project.id}`, { agent })).status).toBe(204)
    expect(db.select().from(projects).where(eq(projects.id, project.id)).get()).toBeUndefined()
    expect(storedChapters(project.id)).toHaveLength(0)
    expect(storedEntities(project.id)).toHaveLength(0)
  })
})

describe('PUT /api/projects/:id/entities', () => {
  test('saves a glossary and reads it back in order', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const glossary = [
      { source: 'Hydra', target: '九头蛇' },
      { source: 'Jason Wood', target: '杰森·伍德' },
    ]

    const { status, body } = await putEntities(agent, project.id, glossary)
    expect(status).toBe(200)
    expect(body.entities).toEqual(glossary)

    const detail = await call<ProjectRow>('GET', `/api/projects/${project.id}`, { agent })
    expect(detail.body.entities).toEqual(glossary)
    expect(storedEntities(project.id).map(row => row.position)).toEqual([0, 1])
  })

  test('keeps an entry that names no original, stored as an empty string', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')

    const { body } = await putEntities(agent, project.id, [{ target: '安娜' }])
    expect(body.entities).toEqual([{ source: '', target: '安娜' }])
    expect(storedEntities(project.id)[0]!.source).toBe('')
  })

  test('replaces the list rather than adding to it, and drops rows nobody typed into', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    await putEntities(agent, project.id, [{ target: 'A' }, { target: 'B' }, { target: 'C' }])

    const { status, body } = await putEntities(agent, project.id, [
      { source: '', target: '' },
      { source: '  ', target: ' 安娜 ' },
      { source: '', target: '' },
    ])
    expect(status).toBe(200)
    expect(body.entities).toEqual([{ source: '', target: '安娜' }])
    expect(storedEntities(project.id)).toHaveLength(1)
  })

  test('refuses a list it cannot accept, and writes nothing', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    await putEntities(agent, project.id, [{ source: 'Hydra', target: '九头蛇' }])

    const bad: unknown[] = [
      [{ source: 'Anna' }],
      Array.from({ length: 201 }, (_, i) => ({ target: `名${i}` })),
      [{ target: 'a'.repeat(101) }],
      '安娜',
      ['安娜'],
      [{ target: 7 }],
    ]

    for (const list of bad) {
      expect((await putEntities(agent, project.id, list)).status).toBe(400)
    }
    expect(storedEntities(project.id)).toHaveLength(1)
  })
})

describe('POST /api/projects/:id/chapters', () => {
  test('appends after the last chapter', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')

    expect((await newChapter(agent, project.id)).position).toBe(0)
    expect((await newChapter(agent, project.id)).position).toBe(1)
  })

  test('refuses to add a chapter to a one-shot', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot')

    const { status, body } = await call('POST', `/api/projects/${project.id}/chapters`, { agent, body: {} })
    expect(status).toBe(400)
    expect(body.error).toContain('one-shot')
    expect(storedChapters(project.id)).toHaveLength(1)
  })
})

describe('PATCH /api/chapters/:id', () => {
  test('saves the original and the translation, and can be read back', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const chapter = await newChapter(agent, project.id)
    const before = stored(project.id).updated_at

    const { status } = await call('PATCH', `/api/chapters/${chapter.id}`, {
      agent,
      body: { source_text: 'Night deepened.', translated_text: '夜色渐深。' },
    })
    expect(status).toBe(200)

    const { body } = await call<{ source_text: string; translated_text: string; project: ProjectRow }>(
      'GET',
      `/api/chapters/${chapter.id}`,
      { agent },
    )
    expect(body).toMatchObject({ source_text: 'Night deepened.', translated_text: '夜色渐深。' })
    expect(body.project.type).toBe('series')
    expect(stored(project.id).updated_at).toBeGreaterThanOrEqual(before)
  })

  test('regenerating overwrites the previous translation', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot')
    const entry = project.entry_chapter_id!

    await call('PATCH', `/api/chapters/${entry}`, { agent, body: { translated_text: '第一版' } })
    await call('PATCH', `/api/chapters/${entry}`, { agent, body: { translated_text: '第二版' } })

    expect(db.select().from(chapters).where(eq(chapters.id, entry)).get()!.translated_text).toBe('第二版')
  })

  test('writes only the keys it was given', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const chapter = await newChapter(agent, project.id)

    await call('PATCH', `/api/chapters/${chapter.id}`, { agent, body: { source_text: 'kept' } })
    await call('PATCH', `/api/chapters/${chapter.id}`, { agent, body: { title: 'Renamed' } })

    expect(storedChapters(project.id)[0]!).toMatchObject({ title: 'Renamed', source_text: 'kept' })
  })

  test('refuses a bad patch', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const chapter = await newChapter(agent, project.id)

    for (const body of [{ source_text: 'a'.repeat(20_001) }, { source_text: 7 }, { title: 7 }, {}]) {
      expect((await call('PATCH', `/api/chapters/${chapter.id}`, { agent, body })).status).toBe(400)
    }
    expect(storedChapters(project.id)[0]!.source_text).toBe('')
  })
})

describe('DELETE /api/chapters/:id', () => {
  test('removes a chapter from its series', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const one = await newChapter(agent, project.id)
    const two = await newChapter(agent, project.id)

    expect((await call('DELETE', `/api/chapters/${one.id}`, { agent })).status).toBe(204)

    const { body } = await call<ProjectRow>('GET', `/api/projects/${project.id}`, { agent })
    expect(body.chapters!.map(c => c.id)).toEqual([two.id])
  })

  test('refuses to delete a one-shot’s only document', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot')

    const { status, body } = await call('DELETE', `/api/chapters/${project.entry_chapter_id}`, { agent })
    expect(status).toBe(400)
    expect(body.error).toContain('one-shot')
    expect(storedChapters(project.id)).toHaveLength(1)
  })
})

describe('what each response carries', () => {
  test('the pair everywhere; the glossary and instructions only where the editor needs them', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', {
      source_lang: 'vi',
      target_lang: 'en',
      instructions: 'Keep it casual.',
    })
    const chapter = await newChapter(agent, project.id)
    await putEntities(agent, project.id, [{ source: 'Hydra', target: '九头蛇' }])

    const pair = { source_lang: 'vi', target_lang: 'en' }
    const full = { ...pair, instructions: 'Keep it casual.', entities: [{ source: 'Hydra', target: '九头蛇' }] }

    const list = await call<ProjectRow[]>('GET', '/api/projects', { agent })
    const row = list.body.find(p => p.id === project.id)!
    expect(row).toMatchObject(pair)
    expect(row).not.toHaveProperty('entities')
    expect(row).not.toHaveProperty('instructions')

    const detail = await call<ProjectRow>('GET', `/api/projects/${project.id}`, { agent })
    expect(detail.body).toMatchObject(full)

    const read = await call<{ project: ProjectRow }>('GET', `/api/chapters/${chapter.id}`, { agent })
    expect(read.body.project).toMatchObject(full)

    const saved = await call<{ project: ProjectRow }>('PATCH', `/api/chapters/${chapter.id}`, {
      agent,
      body: { source_text: 'Đêm sâu.' },
    })
    expect(saved.body.project).toMatchObject(full)
  })
})

describe('ownership', () => {
  test('another user’s rows are 404, not 403, and survive the attempt', async () => {
    const owner = await signup()
    const stranger = await signup()
    const project = await newProject(owner, 'series', { title: 'Owned', instructions: 'A note.' })
    const chapter = await newChapter(owner, project.id)
    await putEntities(owner, project.id, [{ target: '安娜' }])

    const attempts: Attempt[] = [
      ['GET', `/api/projects/${project.id}`],
      ['PATCH', `/api/projects/${project.id}`, { title: 'Mine now' }],
      ['DELETE', `/api/projects/${project.id}`],
      ['PUT', `/api/projects/${project.id}/entities`, { entities: [] }],
      ['POST', `/api/projects/${project.id}/chapters`, {}],
      ['GET', `/api/chapters/${chapter.id}`],
      ['PATCH', `/api/chapters/${chapter.id}`, { source_text: 'overwritten' }],
      ['DELETE', `/api/chapters/${chapter.id}`],
    ]

    for (const [method, path, body] of attempts) {
      expect((await call(method, path, { agent: stranger, body })).status).toBe(404)
    }

    expect(stored(project.id)).toMatchObject({ title: 'Owned', instructions: 'A note.' })
    expect(storedEntities(project.id)).toHaveLength(1)
    expect(storedChapters(project.id)).toHaveLength(1)
    expect(storedChapters(project.id)[0]!.source_text).toBe('')
  })

  test('every route 401s without a session', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const chapter = await newChapter(agent, project.id)

    const attempts: Attempt[] = [
      ['GET', '/api/projects'],
      ['POST', '/api/projects', { title: 'x', type: 'series', source_lang: 'en', target_lang: 'es' }],
      ['GET', `/api/projects/${project.id}`],
      ['PATCH', `/api/projects/${project.id}`, { title: 'x' }],
      ['DELETE', `/api/projects/${project.id}`],
      ['PUT', `/api/projects/${project.id}/entities`, { entities: [] }],
      ['POST', `/api/projects/${project.id}/chapters`, {}],
      ['GET', `/api/chapters/${chapter.id}`],
      ['PATCH', `/api/chapters/${chapter.id}`, { title: 'x' }],
      ['DELETE', `/api/chapters/${chapter.id}`],
    ]

    for (const [method, path, body] of attempts) {
      expect((await call(method, path, { body })).status).toBe(401)
    }
  })
})
