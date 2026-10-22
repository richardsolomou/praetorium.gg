import { cn } from '@/lib/utils'
import type { TextSource } from '../../shared/sourceText'
import { type MissingText, retryFailedTextFiles } from '../sourceText'
import { useHydrated } from '../useClientValue'
import { openTextSourcesDialog } from './TextSourcesDialog'

/**
 * What stands where rules text would be before this device has loaded it.
 *
 * Praetorium publishes names and numbers; the words load in the reader's browser from
 * the community sources they choose, and one choice loads them everywhere.
 */
export function SourceTextPrompt({
  missing,
  source,
  className,
}: {
  missing: Exclude<MissingText, null>
  /** The source this gap's words come from, when the page knows it before the file list loads. */
  source?: TextSource
  className?: string
}) {
  const hydrated = useHydrated()
  // Storage is unread until hydration, so both answers are drawn and the document's choice shows one (styles.css).
  if (!hydrated)
    return (
      <div data-text-gap={source ?? 'any'} className={className}>
        <TextAsk data-text-gap-ask />
        <TextWait data-text-gap-wait />
      </div>
    )
  if (missing === 'loading') return <TextWait className={className} />
  if (missing === 'failed') return <TextFailed className={className} />
  if (missing === 'unavailable') return null
  return <TextAsk className={className} />
}

/** Not a `Problem`: a page of rules has one gap per rule, and an alert for each would flood a screen reader. */
function TextFailed({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-destructive', className)}>
      Couldn’t load the rules text.{' '}
      <button type="button" className="text-info hover:text-bone" onClick={() => void retryFailedTextFiles()}>
        Try again
      </button>
    </p>
  )
}

function TextAsk({ className, ...props }: { className?: string; 'data-text-gap-ask'?: boolean }) {
  return (
    <p className={cn('text-xs text-faint', className)} {...props}>
      Rules text isn’t loaded.{' '}
      <button type="button" className="text-info hover:text-bone" onClick={() => openTextSourcesDialog()}>
        Choose sources
      </button>
    </p>
  )
}

/** Where chosen text will appear: a quiet line the height of one, so the words replace it without moving the page. */
function TextWait({ className, ...props }: { className?: string; 'data-text-gap-wait'?: boolean }) {
  return (
    <output aria-label="Loading rules text" className={cn('flex h-4 items-center', className)} {...props}>
      <span className="h-2 w-40 max-w-full animate-pulse rounded-sm bg-edge" />
    </output>
  )
}
