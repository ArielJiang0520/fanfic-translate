import { MAX_ENTITIES, MAX_ENTITY_CHARS } from '../src/limits'

export interface Entity {
  source: string
  target: string
}

export function readEntities(value: unknown): { entities: Entity[] } | { error: string } {
  if (!Array.isArray(value)) return { error: 'Entities must be a list' }
  if (value.length > MAX_ENTITIES) return { error: `At most ${MAX_ENTITIES} entries` }

  const entities: Entity[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') {
      return { error: 'Each entry is an original and a translation' }
    }
    const { source, target } = row as { source?: unknown; target?: unknown }
    if ((source !== undefined && typeof source !== 'string') || (target !== undefined && typeof target !== 'string')) {
      return { error: 'Each entry is an original and a translation' }
    }

    const from = typeof source === 'string' ? source.trim() : ''
    const to = typeof target === 'string' ? target.trim() : ''
    if (!from && !to) continue
    if (!to) return { error: 'Every entry needs a translation' }
    if (from.length > MAX_ENTITY_CHARS || to.length > MAX_ENTITY_CHARS) {
      return { error: `An entry must be at most ${MAX_ENTITY_CHARS} characters` }
    }

    entities.push({ source: from, target: to })
  }

  return { entities }
}
