import { FlagIcon } from '@/components/flags'
import { language, type LanguageCode } from '@/languages'

// One place the pair is drawn, so it reads the same in the library list, the project subtitle
// and the editor. `labelled` spells the languages out (a sheet has the room); the default is the
// compact form that sits inside a line of metadata.
export function LanguagePair({
  source,
  target,
  labelled = false,
  className,
}: {
  source: LanguageCode
  target: LanguageCode
  labelled?: boolean
  className?: string
}) {
  const from = language(source)
  const to = language(target)

  return (
    <span className={`inline-flex items-center gap-1 align-[-0.05em] ${className ?? ''}`}>
      {/* Read aloud as words: a screen reader announcing two decorative flags is no use. */}
      <span className="sr-only">{`${from.name} to ${to.name}`}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        <FlagIcon code={source} />
        {labelled && from.name}
        <span className="px-0.5">→</span>
        <FlagIcon code={target} />
        {labelled && to.name}
      </span>
    </span>
  )
}
