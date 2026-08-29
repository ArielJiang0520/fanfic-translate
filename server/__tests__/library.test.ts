import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { chapters, db, projects } from '../db'
import { type Agent, call, signup } from './helpers'

// The whole suite shares one in-memory database, so every test signs up its own user and
// scopes its assertions to that user's rows rather than assuming an empty table.

interface ProjectRow {
  id: number
  title: string
  type: string
  updated_at: number
  chapter_count: number
  entry_chapter_id: number | null
}

interface ChapterStub {
  id: number
  title: string
  position: number
  has_translation: boolean
}

async function newProject(agent: Agent, type: 'series' | 'oneshot', title = `${type} title`) {
  const { status, body } = await call<ProjectRow>('POST', '/api/projects', { agent, body: { title, type } })
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

describe('POST /api/projects', () => {
  test('a series starts with no chapters', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', 'Under the Stars')

    expect(project).toMatchObject({ title: 'Under the Stars', type: 'series', chapter_count: 0, entry_chapter_id: null })
    const rows = db.select().from(chapters).where(eq(chapters.project_id, project.id)).all()
    expect(rows).toHaveLength(0)
  })

  test('a one-shot is created with exactly one chapter, ready to open', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot', 'Rainy Night')

    const rows = db.select().from(chapters).where(eq(chapters.project_id, project.id)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe('Rainy Night')
    expect(rows[0]!.position).toBe(0)
    expect(project.entry_chapter_id).toBe(rows[0]!.id)
    expect(project.chapter_count).toBe(1)
  })

  test('rejects a blank title', async () => {
    const agent = await signup()
    const { status, body } = await call('POST', '/api/projects', { agent, body: { title: '   ', type: 'series' } })
    expect(status).toBe(400)
    expect(body.error).toContain('title')
  })

  test('rejects a type that is neither a series nor a one-shot', async () => {
    const agent = await signup()
    const { status, body } = await call('POST', '/api/projects', { agent, body: { title: 'Nope', type: 'anthology' } })
    expect(status).toBe(400)
    expect(body.error).toContain('type')
  })

  test('401s without a session', async () => {
    const { status } = await call('POST', '/api/projects', { body: { title: 'x', type: 'series' } })
    expect(status).toBe(401)
  })
})

describe('GET /api/projects', () => {
  test('lists only the caller’s own projects, newest activity first', async () => {
    const agent = await signup()
    const stranger = await signup()
    const first = await newProject(agent, 'series', 'First')
    const second = await newProject(agent, 'oneshot', 'Second')
    await newProject(stranger, 'series', 'Not mine')

    const { status, body } = await call<ProjectRow[]>('GET', '/api/projects', { agent })
    expect(status).toBe(200)

    const ids = body.map(p => p.id)
    expect(ids).toEqual([second.id, first.id])
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

  test('401s without a session', async () => {
    expect((await call('GET', '/api/projects')).status).toBe(401)
  })
})

describe('GET /api/projects/:id', () => {
  test('returns chapter stubs in position order, without the bodies', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const one = await newChapter(agent, project.id, 'One')
    const two = await newChapter(agent, project.id, 'Two')
    await call('PATCH', `/api/chapters/${two.id}`, { agent, body: { translated_text: '译文' } })

    const { status, body } = await call<{ chapters: ChapterStub[] }>('GET', `/api/projects/${project.id}`, { agent })
    expect(status).toBe(200)
    expect(body.chapters.map(c => c.id)).toEqual([one.id, two.id])
    expect(body.chapters[0]!.has_translation).toBe(false)
    expect(body.chapters[1]!.has_translation).toBe(true)
    expect(body.chapters[0]).not.toHaveProperty('source_text')
    expect(body.chapters[0]).not.toHaveProperty('translated_text')
  })

  test('404s on another user’s project', async () => {
    const owner = await signup()
    const stranger = await signup()
    const project = await newProject(owner, 'series')

    const { status } = await call('GET', `/api/projects/${project.id}`, { agent: stranger })
    expect(status).toBe(404)
  })

  test('404s on an id that is not a number', async () => {
    const agent = await signup()
    expect((await call('GET', '/api/projects/abc', { agent })).status).toBe(404)
  })
})

describe('PATCH /api/projects/:id', () => {
  test('renames a series', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', 'Old')

    const { status, body } = await call('PATCH', `/api/projects/${project.id}`, { agent, body: { title: 'New' } })
    expect(status).toBe(200)
    expect(body.title).toBe('New')
    expect(db.select().from(projects).where(eq(projects.id, project.id)).get()!.title).toBe('New')
  })

  test('renaming a one-shot renames its document too', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot', 'Old')

    await call('PATCH', `/api/projects/${project.id}`, { agent, body: { title: 'New' } })
    const chapter = db.select().from(chapters).where(eq(chapters.project_id, project.id)).get()!
    expect(chapter.title).toBe('New')
  })

  test('refuses to change the type, and leaves it alone', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series', 'Keep me a series')

    const { status, body } = await call('PATCH', `/api/projects/${project.id}`, {
      agent,
      body: { title: 'Keep me a series', type: 'oneshot' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe("A project's type cannot be changed")
    expect(db.select().from(projects).where(eq(projects.id, project.id)).get()!.type).toBe('series')
  })

  test('404s on another user’s project', async () => {
    const owner = await signup()
    const stranger = await signup()
    const project = await newProject(owner, 'series')

    const { status } = await call('PATCH', `/api/projects/${project.id}`, { agent: stranger, body: { title: 'Mine now' } })
    expect(status).toBe(404)
    expect(db.select().from(projects).where(eq(projects.id, project.id)).get()!.title).not.toBe('Mine now')
  })
})

describe('DELETE /api/projects/:id', () => {
  test('takes its chapters with it', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    await newChapter(agent, project.id)
    await newChapter(agent, project.id)

    const { status } = await call('DELETE', `/api/projects/${project.id}`, { agent })
    expect(status).toBe(204)
    expect(db.select().from(chapters).where(eq(chapters.project_id, project.id)).all()).toHaveLength(0)
    expect(db.select().from(projects).where(eq(projects.id, project.id)).get()).toBeUndefined()
  })

  test('404s on another user’s project, which survives', async () => {
    const owner = await signup()
    const stranger = await signup()
    const project = await newProject(owner, 'series')

    expect((await call('DELETE', `/api/projects/${project.id}`, { agent: stranger })).status).toBe(404)
    expect(db.select().from(projects).where(eq(projects.id, project.id)).get()).toBeDefined()
  })
})

describe('POST /api/projects/:id/chapters', () => {
  test('appends after the last chapter', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const one = await newChapter(agent, project.id)
    const two = await newChapter(agent, project.id)

    expect(one.position).toBe(0)
    expect(two.position).toBe(1)
  })

  test('refuses to add a chapter to a one-shot', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot')

    const { status, body } = await call('POST', `/api/projects/${project.id}/chapters`, { agent, body: {} })
    expect(status).toBe(400)
    expect(body.error).toContain('one-shot')
    expect(db.select().from(chapters).where(eq(chapters.project_id, project.id)).all()).toHaveLength(1)
  })

  test('404s on another user’s project', async () => {
    const owner = await signup()
    const stranger = await signup()
    const project = await newProject(owner, 'series')

    expect((await call('POST', `/api/projects/${project.id}/chapters`, { agent: stranger, body: {} })).status).toBe(404)
  })
})

describe('PATCH /api/chapters/:id', () => {
  test('saves the original and the translation, and can be read back', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const chapter = await newChapter(agent, project.id)
    const before = db.select().from(projects).where(eq(projects.id, project.id)).get()!.updated_at

    const { status } = await call('PATCH', `/api/chapters/${chapter.id}`, {
      agent,
      body: { source_text: 'Night deepened.', translated_text: '夜色渐深。' },
    })
    expect(status).toBe(200)

    const { body } = await call<{ source_text: string; translated_text: string; project: { type: string } }>(
      'GET',
      `/api/chapters/${chapter.id}`,
      { agent },
    )
    expect(body.source_text).toBe('Night deepened.')
    expect(body.translated_text).toBe('夜色渐深。')
    expect(body.project.type).toBe('series')
    expect(db.select().from(projects).where(eq(projects.id, project.id)).get()!.updated_at).toBeGreaterThanOrEqual(before)
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

    const row = db.select().from(chapters).where(eq(chapters.id, chapter.id)).get()!
    expect(row.title).toBe('Renamed')
    expect(row.source_text).toBe('kept')
  })

  test('rejects an original over the translate limit', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const chapter = await newChapter(agent, project.id)

    const { status, body } = await call('PATCH', `/api/chapters/${chapter.id}`, {
      agent,
      body: { source_text: 'a'.repeat(20_001) },
    })
    expect(status).toBe(400)
    expect(body.error).toContain('at most')
  })

  test('rejects a body with nothing to save', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const chapter = await newChapter(agent, project.id)

    const { status } = await call('PATCH', `/api/chapters/${chapter.id}`, { agent, body: {} })
    expect(status).toBe(400)
  })

  test('404s on another user’s chapter, which is left untouched', async () => {
    const owner = await signup()
    const stranger = await signup()
    const project = await newProject(owner, 'series')
    const chapter = await newChapter(owner, project.id)

    const { status } = await call('PATCH', `/api/chapters/${chapter.id}`, {
      agent: stranger,
      body: { source_text: 'overwritten' },
    })
    expect(status).toBe(404)
    expect(db.select().from(chapters).where(eq(chapters.id, chapter.id)).get()!.source_text).toBe('')
  })
})

describe('GET /api/chapters/:id', () => {
  test('404s on another user’s chapter', async () => {
    const owner = await signup()
    const stranger = await signup()
    const project = await newProject(owner, 'series')
    const chapter = await newChapter(owner, project.id)

    expect((await call('GET', `/api/chapters/${chapter.id}`, { agent: stranger })).status).toBe(404)
  })

  test('401s without a session', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const chapter = await newChapter(agent, project.id)

    expect((await call('GET', `/api/chapters/${chapter.id}`)).status).toBe(401)
  })
})

describe('DELETE /api/chapters/:id', () => {
  test('removes a chapter from its series', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'series')
    const one = await newChapter(agent, project.id)
    const two = await newChapter(agent, project.id)

    expect((await call('DELETE', `/api/chapters/${one.id}`, { agent })).status).toBe(204)

    const { body } = await call<{ chapters: ChapterStub[] }>('GET', `/api/projects/${project.id}`, { agent })
    expect(body.chapters.map(c => c.id)).toEqual([two.id])
  })

  test('refuses to delete a one-shot’s only document', async () => {
    const agent = await signup()
    const project = await newProject(agent, 'oneshot')

    const { status, body } = await call('DELETE', `/api/chapters/${project.entry_chapter_id}`, { agent })
    expect(status).toBe(400)
    expect(body.error).toContain('one-shot')
    expect(db.select().from(chapters).where(eq(chapters.project_id, project.id)).all()).toHaveLength(1)
  })

  test('404s on another user’s chapter', async () => {
    const owner = await signup()
    const stranger = await signup()
    const project = await newProject(owner, 'series')
    const chapter = await newChapter(owner, project.id)

    expect((await call('DELETE', `/api/chapters/${chapter.id}`, { agent: stranger })).status).toBe(404)
    expect(db.select().from(chapters).where(eq(chapters.id, chapter.id)).get()).toBeDefined()
  })
})
