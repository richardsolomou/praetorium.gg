import { TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ImportReport, UnplacedChoice } from '../../server/importMismatch'

/**
 * What an import could not do, said where the player can act on it.
 *
 * An imported list is saved whatever the import could not read, so the list itself is
 * the only place left to say so. It is said twice on purpose and never the same way:
 * the card carries the detail, because that is where the choice is put right, and the
 * footer carries what has no card — a unit that never arrived at all — and the count
 * of the rest. One module, so the two cannot drift apart.
 */
export function ImportNotice({ report, onDismiss }: { report: ImportReport; onDismiss: () => void }) {
  const changed = report.unplaced.length
  if (!changed && !report.missing.length) return null

  return (
    <section
      className="mt-2 flex items-start gap-2 border border-discarded/40 bg-discarded/5 p-2.5 text-xs text-discarded"
      aria-label="What this import could not do"
    >
      <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold uppercase">Imported with changes</p>
        {report.missing.length ? (
          <ul className="mt-1 list-inside list-disc">
            {report.missing.map((entry) => (
              <li key={entry.name}>
                {entry.name} is not in this list — {entry.reason}
              </li>
            ))}
          </ul>
        ) : null}
        {changed ? (
          <p className="mt-1">
            {changed === 1
              ? 'One unit arrived as its datasheet builds it rather than as this list wrote it, and says so on its card.'
              : `${changed} units arrived as their datasheets build them rather than as this list wrote them, and each says so on its card.`}
          </p>
        ) : null}
        <p className="mt-1 text-faint">Dismissing this drops it for good; the list itself does not change either way.</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss what this import could not do"
        className="-mt-1 -mr-1 shrink-0 text-discarded hover:text-bone"
        onClick={onDismiss}
      >
        <X className="size-4" />
      </Button>
    </section>
  )
}

/** The same fact on the unit it belongs to, which is where the player sets it right. */
export function UnitImportNote({ choices }: { choices: readonly UnplacedChoice[] }) {
  return (
    <span className="min-w-0 text-xs text-discarded">
      {choices.map((choice) => (
        <span key={choice.name} className="block">
          Could not apply {choice.name}: {choice.reason}
        </span>
      ))}
    </span>
  )
}
