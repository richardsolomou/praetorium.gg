import { Link } from '@tanstack/react-router'
import { ListFilter } from 'lucide-react'
import type { ReactNode } from 'react'
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
import { CARD_SAMPLE, type CardRecord, type RecordFacets, type ServiceRecord, type Split } from '../../../core/serviceRecord'
import { routeSlug } from '../../../core/slug'
import type { PlayerProfileFilter } from '../../queries'
import { FactionMark } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SearchableSelect } from '../../components/SearchableSelect'

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
    <section data-onboarding="profile-record" data-service-record>
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
          <Tallies
            label="Command points"
            items={[
              { label: 'Spent per battle', value: oneDecimal(record.averageCpSpent) },
              // A side that spent nothing has no rate to divide into, so the cell is absent rather than zero.
              ...(record.pointsPerCp === null ? [] : [{ label: 'VP per CP spent', value: oneDecimal(record.pointsPerCp) }]),
            ]}
          />
          <CareerTables record={record} />
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ListFilter />
        Filter
        {narrowed ? <span className="chip readout">{narrowed}</span> : null}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter record</DialogTitle>
          <DialogDescription>Narrow the record to the battles you want it counted from.</DialogDescription>
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
                      ...facets[dimension.facet].map((facet) => ({
                        label: `${facet.label} (${facet.battles})`,
                        value: facet.value,
                        icon:
                          dimension.key === 'opponentId' ? (
                            <PlayerAvatar name={facet.label} image={facet.image} className="size-6 text-3xs" />
                          ) : undefined,
                      })),
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
                className="mt-1"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={!narrowed} onClick={() => onFilter({})} className="sm:mr-auto sm:ml-0">
            Clear
          </Button>
          <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
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

const NAME_LINK = 'font-bold break-words uppercase hover:text-info'

/**
 * What the side did with its resources, and how it fared by mission and by army faced.
 *
 * Each table is ordered by columns it prints, so a reader can check the order
 * against the rows. The tables fit a phone rather than scrolling: the name column
 * wraps and the counts stay narrow.
 */
function CareerTables({ record }: { record: ServiceRecord }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <RecordTable
        label="Stratagems"
        note={record.stratagemsUsed > record.stratagems.length ? `Top ${record.stratagems.length} of ${record.stratagemsUsed}` : undefined}
        empty="No stratagems were used in these battles."
        rows={record.stratagems}
        rowKey={(row) => row.key}
        renderName={(row) =>
          row.reference ? (
            <Link
              to="/factions/$catalogueId/detachments/$detachmentId"
              params={row.reference}
              hash={`stratagem-${routeSlug(row.name)}`}
              className={NAME_LINK}
            >
              {row.name}
            </Link>
          ) : (
            <span className="font-bold break-words uppercase">{row.name}</span>
          )
        }
        columns={[
          { label: 'Uses', cell: (row) => row.uses, tint: 'text-bone' },
          { label: 'CP', cell: (row) => row.cp },
        ]}
      />
      <div className="space-y-2">
        <RecordTable
          label="Secondary missions"
          empty="No secondary missions were held in these battles."
          rows={record.cards}
          rowKey={(row) => row.key}
          renderName={(row) => <CardName card={row} />}
          columns={[
            { label: 'Held', cell: (row) => row.held, tint: 'text-bone' },
            { label: 'Scored', cell: (row) => row.scored },
            { label: 'Avg VP', cell: (row) => oneDecimal(row.average), tint: 'text-info' },
          ]}
        />
        {record.bestCard && record.worstCard ? (
          <div className="flex flex-wrap gap-2">
            <CardHighlight label="Best" card={record.bestCard} />
            <CardHighlight label="Worst" card={record.worstCard} />
          </div>
        ) : null}
      </div>
      <RecordTable
        label="Primary missions"
        empty="No primary missions were recorded in these battles."
        rows={record.primaryMissions}
        rowKey={(row) => row.key}
        renderName={(row) =>
          row.reference ? (
            <Link to="/mission-matchups/$packId/$you/$opponent" params={row.reference} className={NAME_LINK}>
              {row.name}
            </Link>
          ) : (
            <span className="font-bold break-words uppercase">{row.name}</span>
          )
        }
        columns={[
          { label: 'Played', cell: (row) => row.battles, tint: 'text-bone' },
          ...results,
          { label: 'Avg VP', cell: (row) => oneDecimal(row.averagePoints), tint: 'text-info' },
        ]}
      />
      <RecordTable
        label="Against factions"
        empty="None of the armies faced in these battles name a faction."
        rows={record.opposingFactions}
        rowKey={(row) => row.faction.slug}
        renderName={(row) => (
          <Link
            to="/factions/$catalogueId"
            params={{ catalogueId: row.faction.slug }}
            className="flex min-w-0 items-center gap-2 hover:text-info"
          >
            <FactionMark id={row.faction.slug} icon={row.faction.icon} size="sm" />
            <span className="font-bold break-words uppercase">{row.faction.displayName}</span>
          </Link>
        )}
        columns={[
          { label: 'Played', cell: (row) => row.battles, tint: 'text-bone' },
          ...results,
          { label: 'Rate', cell: (row) => percent(row.rate) },
        ]}
      />
    </div>
  )
}

type Column<T> = { label: string; cell: (row: T) => ReactNode; tint?: string }

const results: Column<{ won: number; drawn: number; lost: number }>[] = [
  { label: 'W', cell: (row) => row.won, tint: 'text-achieved' },
  { label: 'D', cell: (row) => row.drawn },
  { label: 'L', cell: (row) => row.lost, tint: 'text-rust' },
]

/** A compact table: a name that wraps, then narrow right-aligned counts. */
function RecordTable<T>({
  label,
  note,
  empty,
  rows,
  rowKey,
  renderName,
  columns,
}: {
  label: string
  note?: string
  empty: string
  rows: readonly T[]
  rowKey: (row: T) => string
  renderName: (row: T) => ReactNode
  columns: readonly Column<T>[]
}) {
  return (
    <section data-record-table={label}>
      <p className="eyebrow flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {note ? <span className="normal-case">{note}</span> : null}
      </p>
      {rows.length ? (
        <table className="mt-1 w-full table-fixed border-collapse border border-edge bg-panel text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-2xs tracking-wide text-faint uppercase">
              <th scope="col" className="px-2 py-1.5 font-normal">
                Name
              </th>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={`${column.label.length > 2 ? 'w-12' : 'w-7'} px-1.5 py-1.5 text-right font-normal`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-edge last:border-0">
                <td className="px-2 py-1.5">{renderName(row)}</td>
                {columns.map((column) => (
                  <td key={column.label} className={`readout px-1.5 py-1.5 text-right ${column.tint ?? 'text-dim'}`}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-1 border border-edge bg-panel p-3 text-sm text-dim">{empty}</p>
      )}
    </section>
  )
}

function CardName({ card }: { card: CardRecord }) {
  return card.reference ? (
    <Link
      to="/mission-packs/$packId/secondary-missions/$cardId"
      params={{ packId: card.reference.packId, cardId: card.key }}
      className={NAME_LINK}
    >
      {card.name}
    </Link>
  ) : (
    <span className="font-bold break-words uppercase">{card.name}</span>
  )
}

/** The best or worst card, which only exist once enough cards have been held often enough to compare. */
function CardHighlight({ label, card }: { label: string; card: CardRecord }) {
  return (
    <div className="min-w-40 flex-1 border border-edge bg-panel p-3">
      <p className="eyebrow">
        {label} · held {CARD_SAMPLE}+
      </p>
      <p className="mt-1 text-sm">
        <CardName card={card} />
      </p>
      <p className="readout mt-1 text-xs text-dim">{oneDecimal(card.average)} VP per battle held</p>
    </div>
  )
}

/** A turn-order rate, left out entirely when no battle has been played that way. */
const turnRate = (label: string, split: Split): TallyItem[] =>
  split.battles ? [{ label: `${label} (${split.battles})`, value: percent(split.rate) }] : []

const percent = (rate: number) => `${Math.round(rate * 100)}%`

/** One decimal, because these are averages and a rounded one hides the difference. */
const oneDecimal = (value: number) => value.toFixed(1)
