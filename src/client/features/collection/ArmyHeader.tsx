import { Skeleton } from '@/components/ui/skeleton'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { countLabel } from '../../text'
import { ShelfLine } from './ShelfLine'

type Totals = { owned: number; built: number; painted: number }

/** An army's heading on a shelf; owned models get their shelf line as the heading's rule, wanted ones a dashed line, as models not yet on it. */
export function ArmyHeader({
  name,
  faction,
  datasheets,
  totals,
  pending = false,
}: {
  name: string
  faction?: FactionPresentation
  datasheets: number
  totals: Totals | { wanted: number }
  pending?: boolean
}) {
  return (
    <header className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {faction ? <FactionMark faction={faction} size="md" /> : null}
          <div className="min-w-0">
            <h2 className="rubric break-words text-bone">{name}</h2>
            <p className="mt-0.5 text-xs text-dim">{countLabel(datasheets, 'datasheet')}</p>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(totals).map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-x-1.5">
              <dt className="text-xs text-dim capitalize">{label}</dt>
              <dd data-collection-total={label} className="figure text-lg text-bone">
                {pending ? <Skeleton className="h-6 w-8" aria-label={`Loading ${label}`} /> : value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {'owned' in totals ? (
        pending ? (
          <div className="h-px bg-edge" />
        ) : (
          <ShelfLine {...totals} />
        )
      ) : (
        <span data-line="todo" className="line-segment" />
      )}
    </header>
  )
}
