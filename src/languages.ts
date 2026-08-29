// The languages a project can be created between. Shared by both sides — the server validates
// against it and builds the model's instruction from it, the client draws the pickers and the
// editor's tab from it — which is why it sits under src/ rather than server/, the same reason
// utils/sse.ts does. Data only, no JSX: the flags are drawn in components/flags.tsx, which the
// server has no business importing.
//
// `name` is deliberately one string for both jobs: it is what the tab says and what the model
// is told to translate into, so the label and the instruction can never drift apart.
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'zh-Hans', name: 'Simplified Chinese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'vi', name: 'Vietnamese' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']
export type Language = (typeof LANGUAGES)[number]

// What every project made before languages existed was translating between, and so the columns'
// defaults in server/schema.ts and where the New project sheet starts.
export const DEFAULT_SOURCE_LANG: LanguageCode = 'en'
export const DEFAULT_TARGET_LANG: LanguageCode = 'zh-Hans'

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && LANGUAGES.some(l => l.code === value)
}

export function language(code: LanguageCode): Language {
  // Every caller has already been through isLanguageCode or a typed column, so the fallback is
  // only here to keep the return non-nullable at the call sites.
  return LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0]
}

export function languageName(code: LanguageCode): string {
  return language(code).name
}
