import type { CatalogueEdition } from '../../../core/catalogueEdition'
import { Button } from '@/components/ui/button'

export function RosterRulesNotice({
  edition,
  current,
  onConvert,
}: {
  edition?: Pick<CatalogueEdition, 'name' | 'status'> | null
  /** The current rules for this army, when the roster keeps an earlier version. */
  current?: string | null
  onConvert?: () => void
}) {
  if (!current && edition?.status !== 'retired') return null
  return (
    <p data-roster-rules-notice className="mt-1 text-xs text-discarded">
      This roster uses {edition?.name ?? 'an earlier rules version'}.{' '}
      {current
        ? `${current} is the current rules version. Convert rules version to review points and legality changes.`
        : 'Convert rules version to check current points and legality.'}{' '}
      {onConvert ? (
        <Button variant="ghost" size="xs" className="h-auto p-0 text-discarded underline" onClick={onConvert}>
          Convert rules version
        </Button>
      ) : null}
    </p>
  )
}
