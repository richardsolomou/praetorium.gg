import { cn } from '@/lib/utils'
import { type MissingText, retryFailedTextFiles } from '../sourceText'

const OFFICIAL_RULES = 'https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/'

export function OfficialRulesLink() {
  return (
    <a className="text-info hover:text-bone" href={OFFICIAL_RULES} target="_blank" rel="noreferrer">
      Official rules and downloads
    </a>
  )
}

export function RuleSummaryCredit() {
  return <p className="mt-1 font-sans text-xs text-faint">40kdc community summary</p>
}

export function SourceTextPrompt({ missing, className }: { missing: Exclude<MissingText, null>; className?: string }) {
  if (missing === 'loading')
    return (
      <output aria-label="Loading rule summary" className={cn('flex h-4 items-center', className)}>
        <span className="h-2 w-40 max-w-full animate-pulse rounded-sm bg-edge" />
      </output>
    )
  if (missing === 'failed')
    return (
      <p className={cn('text-xs text-destructive', className)}>
        Couldn’t load the rule summary.{' '}
        <button type="button" className="text-info hover:text-bone" onClick={() => void retryFailedTextFiles()}>
          Try again
        </button>
      </p>
    )
  return (
    <p className={cn('text-xs text-faint', className)}>
      Summary unavailable. <OfficialRulesLink />
    </p>
  )
}
