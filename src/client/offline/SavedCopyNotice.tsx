import { Button } from '@/components/ui/button'
import { useSavedCopy } from './reads'

/** Says a list shows the copy saved on this device because the service did not answer, so a finished game is not read as live. */
export function SavedCopyNotice({ queryKey, onRetry }: { queryKey: readonly unknown[]; onRetry: () => void }) {
  if (!useSavedCopy(queryKey)) return null
  return (
    <output className="flex flex-wrap items-center gap-3 text-sm text-dim">
      <span>This list can be out of date. Praetorium could not refresh it, so it shows the copy saved on this device.</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </output>
  )
}
