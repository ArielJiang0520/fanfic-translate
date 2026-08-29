import { CN, ES, GB, JP, KR, VN } from 'country-flag-icons/react/3x2'
import type { LanguageCode } from '@/languages'

// Not emoji. Flag emoji are regional-indicator letter pairs, and a platform without the glyphs
// renders them as the letters themselves — Windows shows a bare "GB" — so the one place the app
// names a language visually cannot rely on them. These are real SVGs, imported one at a time so
// only the six the app uses are bundled.
//
// Keyed by language rather than by country: the app never asks "which flag is this", it asks
// "what does English look like".
const FLAGS: Record<LanguageCode, typeof GB> = {
  'en': GB,
  'es': ES,
  'zh-Hans': CN,
  'ko': KR,
  'ja': JP,
  'vi': VN,
}

// 18×12, the 3:2 the icons are drawn at. The hairline ring gives Japan and Korea an edge they
// would otherwise lack against a white background.
const frame = 'inline-block h-3 w-[1.125rem] shrink-0 rounded-[1px] align-[-0.1em] ring-1 ring-black/15'

export function FlagIcon({ code, className }: { code: LanguageCode; className?: string }) {
  const Flag = FLAGS[code]
  return <Flag className={className ?? frame} />
}
