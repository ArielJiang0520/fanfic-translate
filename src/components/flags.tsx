import { CN, ES, GB, JP, KR, VN } from 'country-flag-icons/react/3x2'
import type { LanguageCode } from '@/languages'

const FLAGS: Record<LanguageCode, typeof GB> = {
  'en': GB,
  'es': ES,
  'zh-Hans': CN,
  'ko': KR,
  'ja': JP,
  'vi': VN,
}

const frame = 'inline-block h-3 w-[1.125rem] shrink-0 rounded-[1px] align-[-0.1em] ring-1 ring-black/15'

export function FlagIcon({ code, className }: { code: LanguageCode; className?: string }) {
  const Flag = FLAGS[code]
  return <Flag className={className ?? frame} />
}
