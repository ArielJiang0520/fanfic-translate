import { FlagIcon } from '@/components/flags'
import { language, type LanguageCode } from '@/languages'

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
