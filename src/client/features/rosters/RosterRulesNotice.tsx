import type { CatalogueEdition } from '../../../core/catalogueEdition'
import { Button } from '@/components/ui/button'

export function RosterRulesNotice({
  edition,
  onConvert,
}: {
  edition?: Pick<CatalogueEdition, 'name' | 'status'> | null
  onConvert?: () => void
}) {
  if (edition?.status !== 'retired') return null
  return (
    <p data-roster-rules-notice className="mt-1 text-xs text-discarded">
      This roster uses {edition.name}. Convert rules version to check current points and legality.{' '}
      {onConvert ? (
        <Button variant="ghost" size="xs" className="h-auto p-0 text-discarded underline" onClick={onConvert}>
          Convert rules version
        </Button>
      ) : null}
    </p>
  )
}
