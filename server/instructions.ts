import { MAX_INSTRUCTIONS_CHARS } from '../src/limits'

export function readInstructions(value: unknown): { instructions: string } | { error: string } {
  if (value === undefined || value === null) return { instructions: '' }
  if (typeof value !== 'string') return { error: 'Instructions must be text' }

  const instructions = value.trim()
  if (instructions.length > MAX_INSTRUCTIONS_CHARS) {
    return { error: `Instructions must be at most ${MAX_INSTRUCTIONS_CHARS} characters` }
  }

  return { instructions }
}
