import { ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { RecordFacets, ServiceRecord, Split } from '../../../core/serviceRecord'
import type { PlayerProfileFilter } from '../../queries'
import { SearchableSelect } from '../SearchableSelect'

/** Which dimension a control narrows, and how the address carries it. */
type Dimension = { key: keyof PlayerProfileFilter; label: string; facet: keyof RecordFacets }

/**
 * The order they read in: what the player brought, then what they faced, then the
 * game itself.
 */
const DIMENSIONS: readonly Dimension[] = [
  { key: 'faction', label: 'Faction', facet: 'factions' },
  { key: 'detachment', label: 'Detachment', facet: 'detachments' },
  { key: 'opponentFaction', label: 'Against faction', facet: 'opponentFactions' },
  { key: 'opponentDetachment', label: 'Against detachment', facet: 'opponentDetachments' },
  { key: 'opponentId', label: 'Opponent', facet: 'opponents' },
  { key: 'missionPackId', label: 'Mission pack', facet: 'missionPacks' },
  { key: 'limit', label: 'Battle size', facet: 'limits' },
]

const ALL = 'all'

/**
 * How a player plays, over the battles a reader of the profile may see.
 *
 * Every number is folded rather than stored, so narrowing the battles is the whole
 * of narrowing the record. The narrowing rides in the address for the same reason
 * the leaderboard's faction does: "how they do against Orks" is a link to send.
 */
export function ServiceRecordPanel({
  record,
  facets,
  filter,
  onFilter,
}: {
  record: ServiceRecord
  facets: RecordFacets
  filter: PlayerProfileFilter
  onFilter: (next: PlayerProfileFilter) => void
}) {
  return (
    <section data-service-record>
      <div className="flex items-baseline justify-between gap-3 border-b border-edge pb-2">
        <p className="rubric">Service record</p>
        <RecordFilters facets={facets} filter={filter} onFilter={onFilter} />
      </div>
      {record.battles ? (
        <div className="mt-2 space-y-3">
          <Tallies
            label="Totals"
            items={[
              { label: 'Played', value: record.battles },
              { label: 'Won', value: record.won, tint: 'text-achieved' },
              { label: 'Drawn', value: record.drawn },
              { label: 'Lost', value: record.lost, tint: 'text-rust' },
            ]}
          />
          <Tallies
            label="Win rates"
            items={[
              { label: 'Overall', value: percent(record.rate) },
              // The count is in the label because one battle going first is a 100%
              // that means nothing, and a reader should not have to take it on trust.
              ...turnRate('Going first', record.goingFirst),
              ...turnRate('Going second', record.goingSecond),
            ]}
          />
          <Tallies
            label="Victory points per battle"
            items={[
              { label: 'Overall', value: oneDecimal(record.averagePoints) },
              { label: 'Winning', value: oneDecimal(record.averageInWins) },
              { label: 'Losing', value: oneDecimal(record.averageInLosses) },
              { label: 'Behind when losing', value: oneDecimal(record.lossDifferential) },
              { label: 'Primary', value: oneDecimal(record.averagePrimary) },
              { label: 'Secondary', value: oneDecimal(record.averageSecondary) },
            ]}
          />
          <Tallies
            label="Win streaks"
            items={[
              { label: 'Current', value: record.currentStreak },
              { label: 'Longest', value: record.longestStreak },
            ]}
          />
        </div>
      ) : (
        <p className="mt-2 border border-edge bg-panel p-5 text-sm text-dim">
          {active(filter) ? 'No battles match that.' : 'No finished battles here yet.'}
        </p>
      )}
    </section>
  )
}

const active = (filter: PlayerProfileFilter) => DIMENSIONS.filter((dimension) => filter[dimension.key] !== undefined).length

/**
 * One Filter button at every width, the same as the roster library's.
 *
 * Seven side-by-side comboboxes do not fit a phone, and a second set of them for
 * narrow screens would be a second copy of every control and label. A dimension
 * with nothing to choose between is left out of the dialog, because a control that
 * can only be set to what it already says wastes a tap.
 */
function RecordFilters({
  facets,
  filter,
  onFilter,
}: {
  facets: RecordFacets
  filter: PlayerProfileFilter
  onFilter: (next: PlayerProfileFilter) => void
}) {
  const offered = DIMENSIONS.filter((dimension) => facets[dimension.facet].length > 1 || filter[dimension.key] !== undefined)
  const narrowed = active(filter)
  if (!offered.length) return null
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" className="rounded-none border-edge bg-sunken uppercase" />}>
        <ListFilter />
        Filter
        {narrowed ? <span className="chip readout">{narrowed}</span> : null}
      </DialogTrigger>
      <DialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
        <DialogHeader>
          <DialogTitle className="uppercase">Filter record</DialogTitle>
          <DialogDescription className="text-dim">Narrow the record to the battles you want it counted from.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {offered.map((dimension) => (
            <div key={dimension.key}>
              <Label className="eyebrow block">{dimension.label}</Label>
              <SearchableSelect
                ariaLabel={dimension.label}
                groups={[
                  {
                    label: '',
                    items: [
                      { label: 'All', value: ALL },
                      ...facets[dimension.facet].map((facet) => ({ label: `${facet.label} (${facet.battles})`, value: facet.value })),
                    ],
                  },
                ]}
                value={filter[dimension.key] === undefined ? ALL : String(filter[dimension.key])}
                onValueChange={(chosen) =>
                  onFilter({
                    ...filter,
                    [dimension.key]: chosen === ALL ? undefined : dimension.key === 'limit' ? Number(chosen) : chosen,
                  })
                }
                placeholder="All"
                className="mt-1 h-9 rounded-none border-edge bg-sunken text-xs font-semibold uppercase"
              />
            </div>
          ))}
        </div>
        <DialogFooter className="rounded-none border-edge bg-sunken">
          <Button variant="ghost" disabled={!narrowed} onClick={() => onFilter({})} className="rounded-none uppercase">
            Clear
          </Button>
          <DialogClose render={<Button className="rounded-none uppercase" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type TallyItem = { label: string; value: number | string; tint?: string }

/**
 * A labelled set of numbers.
 *
 * The cells grow to fill the row rather than sitting in fixed columns, because a
 * group holds anywhere from two of them to six and a grid wide enough for six
 * leaves holes under the ones that hold two.
 */
function Tallies({ label, items }: { label: string; items: readonly TallyItem[] }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {items.map((item) => (
          <div key={item.label} className="min-w-28 flex-1 border border-edge bg-panel p-3">
            <p className="eyebrow truncate">{item.label}</p>
            <p className={`readout mt-1 text-2xl leading-none font-bold ${item.tint ?? 'text-bone'}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A turn-order rate, left out entirely when no battle has been played that way. */
const turnRate = (label: string, split: Split): TallyItem[] =>
  split.battles ? [{ label: `${label} (${split.battles})`, value: percent(split.rate) }] : []

const percent = (rate: number) => `${Math.round(rate * 100)}%`

/** One decimal, because these are averages and a rounded one hides the difference. */
const oneDecimal = (value: number) => value.toFixed(1)
