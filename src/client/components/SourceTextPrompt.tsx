import { cn } from '@/lib/utils'
import { chooseRulesText } from '../rulesText'
import type { MissingText } from '../sourceText'

/**
 * What stands where rules text would be before this device has loaded it.
 *
 * Praetorium publishes names and numbers; the words load in the reader's browser from
 * the community source once they ask, and one choice loads them everywhere.
 */
export function SourceTextPrompt({ missing, className }: { missing: Exclude<MissingText, null>; className?: string }) {
  if (missing === 'loading') return <p className={cn('text-xs text-faint', className)}>Loading rules text…</p>
  if (missing === 'unavailable') return null
  return (
    <p className={cn('text-xs text-faint', className)}>
      Rules text isn’t loaded.{' '}
      <button type="button" className="text-info hover:text-bone" onClick={() => chooseRulesText(true)}>
        Load rules text
      </button>
    </p>
  )
}
