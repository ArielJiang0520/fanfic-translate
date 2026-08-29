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

export const DEFAULT_SOURCE_LANG: LanguageCode = 'en'
export const DEFAULT_TARGET_LANG: LanguageCode = 'zh-Hans'

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && LANGUAGES.some(l => l.code === value)
}

export function language(code: LanguageCode): Language {
  return LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0]
}

export function languageName(code: LanguageCode): string {
  return language(code).name
}
