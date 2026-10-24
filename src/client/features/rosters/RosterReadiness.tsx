import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { collectionDatasheets } from '../../../core/collection'
import { rosterReadiness, type RosterReadiness as Readiness } from '../../../core/collectionReadiness'
import {
  collectionCountsQuery,
  collectionCountsAsQuery,
  collectionProgressQuery,
  collectionWishesQuery,
  combatUnitsQuery,
} from '../../queries'
import { useCollectionWantedMutation } from '../../useCollection'
import { useHydrated } from '../../useClientValue'
import { countLabel } from '../../text'

/** The reader's own collection against this roster, closed until asked for; it never changes points or legality. */
export function RosterReadiness({ units }: { units: readonly { entryId: string; name: string; models: number }[] }) {
  const counts = useQuery(collectionCountsQuery())
  const progress = useQuery(collectionProgressQuery())
  const wishes = useQuery(collectionWishesQuery())
  const countsAs = useQuery(collectionCountsAsQuery())
  const linked = Object.keys(countsAs.data ?? {}).length > 0
  // Only borrowed models need names from outside the roster.
  const sheets = useQuery({ ...combatUnitsQuery(), enabled: linked, select: collectionDatasheets })
  // A launch from saved state has these before the server's page does, so the section waits for hydration.
  const hydrated = useHydrated()
  if (!hydrated || !counts.data || !progress.data || !wishes.data || !countsAs.data) return null
  const readiness = rosterReadiness(units, { counts: counts.data, progress: progress.data, wishes: wishes.data, countsAs: countsAs.data })
  const empty = !Object.keys(counts.data).length
  return (
    <Collapsible render={<section aria-label="Your collection" data-roster-readiness />} className="border-t border-edge pt-1.5">
      <div className="flex w-full items-center justify-between gap-3 py-1.5">
        <h2 className="rubric">Your collection</h2>
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-dim" data-readiness-summary>
            {empty ? 'Not counted yet' : summary(readiness)}
          </span>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="icon-xs" aria-label="Toggle Your collection" className="group text-faint" />}
          >
            <ChevronDown className="size-4 transition-transform group-data-panel-open:rotate-180" aria-hidden />
          </CollapsibleTrigger>
        </span>
      </div>
      <CollapsibleContent>
        <div className="space-y-2 pb-3">
          <p className="text-xs text-dim">
            Each model is counted once: units of the same datasheet share them, and so do the datasheets your models can also be. Equipment
            is not counted. This never changes points or legality.{' '}
            <Link to="/collection" className="text-info underline">
              Count your models
            </Link>
          </p>
          <ul className="divide-y divide-edge border border-edge">
            {readiness.datasheets.map((row) => (
              <ReadinessRow key={row.entryId} row={row} nameOf={(entryId) => sheets.data?.get(entryId)?.name} />
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function summary(readiness: Readiness) {
  if (readiness.short) return `${countLabel(readiness.short, 'model')} short`
  if (readiness.toBuild) return `${readiness.toBuild} to build`
  if (readiness.toPaint) return `${readiness.toPaint} to paint`
  return 'Ready to field'
}

function ReadinessRow({ row, nameOf }: { row: Readiness['datasheets'][number]; nameOf: (entryId: string) => string | undefined }) {
  const wanted = useCollectionWantedMutation()
  const remaining = [
    row.short ? `${row.short} short` : null,
    row.toBuild ? `${row.toBuild} to build` : null,
    row.toPaint ? `${row.toPaint} to paint` : null,
  ].filter(Boolean)
  return (
    <li data-readiness-unit={row.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 font-semibold break-words text-bone uppercase">
        {row.name}
        {row.units > 1 ? <span className="ml-1 text-xs font-normal text-dim normal-case">× {row.units} units</span> : null}
      </span>
      <span className="readout text-xs text-dim">
        {row.needed} needed · {row.owned} owned · {row.built} built · {row.painted} painted
      </span>
      {row.from.length ? (
        <span data-readiness-from className="w-full text-xs text-dim">
          {row.from.map(({ entryId, models }) => `${models} from your ${nameOf(entryId) ?? 'other datasheets'}`).join(' · ')}
        </span>
      ) : null}
      <span className={`w-full text-xs ${remaining.length ? 'text-discarded' : 'text-achieved'}`}>
        {remaining.length ? remaining.join(' · ') : 'Ready'}
        {row.wanted ? <span className="text-dim"> · {row.wanted} on your wishlist</span> : null}
      </span>
      {row.short > row.wanted ? (
        <Button
          variant="outline"
          size="xs"
          disabled={wanted.isPending}
          onClick={() => wanted.mutate({ entryId: row.entryId, wanted: row.short })}
        >
          Add {row.short} to wishlist
        </Button>
      ) : null}
    </li>
  )
}
