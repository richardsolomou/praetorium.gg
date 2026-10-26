import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { Link } from '@tanstack/react-router'
import { ListFilter } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  type CardRecord,
  RECORD_SAMPLE,
  type RecordFacets,
  type ServiceRecord,
  type Split,
  type StratagemRecord,
} from '../../../core/serviceRecord'
import { routeSlug } from '../../../core/slug'
import type { PlayerProfileFilter } from '../../queries'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/Dialog'
import { FactionMark } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SearchableSelect } from '../../components/SearchableSelect'
import { percentLabel, countLabel } from '../../text'

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
        <h2 className="rubric">Service record</h2>
        <RecordFilters facets={facets} filter={filter} onFilter={onFilter} />
      </div>
      {record.battles ? (
        <div className="mt-2 space-y-3">
          <Results record={record} />
          <Tallies
            label="Per battle"
            items={[
              { label: 'Victory points', value: oneDecimal(record.averagePoints) },
              { label: 'In wins', value: oneDecimal(record.averageInWins) },
              // Without a loss these are not zero but absent.
              { label: 'In losses', value: record.lost ? oneDecimal(record.averageInLosses) : '—' },
              { label: 'Behind when losing', value: record.lost ? oneDecimal(record.lossDifferential) : '—' },
              { label: 'Primary', value: oneDecimal(record.averagePrimary) },
              { label: 'Secondary', value: oneDecimal(record.averageSecondary) },
              { label: 'CP spent', value: oneDecimal(record.averageCpSpent) },
              // A side that spent nothing has no rate to divide into, so the cell is absent rather than zero.
              ...(record.pointsPerCp === null ? [] : [{ label: 'VP per CP', value: oneDecimal(record.pointsPerCp) }]),
            ]}
          />
          <CareerTables record={record} />
        </div>
      ) : (
        <p className="py-2 text-sm text-dim">
          {active(filter) ? (
            <>
              No battles match these filters.{' '}
              <button type="button" className="text-info hover:text-parchment" onClick={() => onFilter({})}>
                Clear filters
              </button>
            </>
          ) : (
            'No finished battles here yet.'
          )}
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
        <DialogBody className="gap-3">
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
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" disabled={!narrowed} onClick={() => onFilter({})} className="sm:mr-auto sm:ml-0">
            Clear filters
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
      <dl className="mt-1 flex flex-wrap border-t border-l border-edge bg-panel">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 grow basis-1/2 border-r border-b border-edge px-3 py-2.5 sm:basis-1/4">
            <dt className="eyebrow truncate text-faint">{item.label}</dt>
            <dd className={`figure mt-1 text-xl leading-none font-bold ${item.tint ?? 'text-bone'}`}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * The record's headline: how the battles went, as numbers and as one bar, beside the
 * win rate split by turn order and the streak still running.
 */
function Results({ record }: { record: ServiceRecord }) {
  const share = (count: number) => `${(count / record.battles) * 100}%`
  return (
    <div
      data-record-battles={record.battles}
      className="grid border border-edge bg-panel md:grid-cols-[1.4fr_1fr_1fr] md:divide-x md:divide-edge"
    >
      <div className="p-4">
        <p className="eyebrow text-faint">Results · {countLabel(record.battles, 'battle')}</p>
        <p className="figure mt-2 text-4xl leading-none font-bold">
          <span className="text-achieved">{record.won}</span>
          <span className="px-1 text-2xl text-faint">–</span>
          <span className="text-dim">{record.drawn}</span>
          <span className="px-1 text-2xl text-faint">–</span>
          <span className="text-rust">{record.lost}</span>
        </p>
        <p className="eyebrow mt-1 text-faint">Won · drawn · lost</p>
        <span className="mt-3 flex h-1.5 overflow-hidden bg-edge" aria-hidden>
          <span className="bg-achieved" style={{ width: share(record.won) }} />
          <span className="bg-dim" style={{ width: share(record.drawn) }} />
          <span className="bg-rust" style={{ width: share(record.lost) }} />
        </span>
      </div>
      <div className="border-t border-edge p-4 md:border-t-0">
        <p className="eyebrow text-faint">Win rate</p>
        <p className="figure mt-2 text-4xl leading-none font-bold text-bone">{percentLabel(record.rate)}</p>
        <div className="mt-3 space-y-1.5">
          <TurnSplit label="Going first" split={record.goingFirst} />
          <TurnSplit label="Going second" split={record.goingSecond} />
        </div>
      </div>
      <div className="border-t border-edge p-4 md:border-t-0">
        <p className="eyebrow text-faint">Win streak</p>
        <p className="figure mt-2 text-4xl leading-none font-bold text-bone">{record.currentStreak}</p>
        <p className="mt-2 text-xs text-dim">
          Longest <span className="readout text-bone">{record.longestStreak}</span>
        </p>
      </div>
    </div>
  )
}

/** A turn-order rate as a thin bar, with how many battles it rests on; absent when none were played that way. */
function TurnSplit({ label, split }: { label: string; split: Split }) {
  if (!split.battles) return null
  return (
    <div>
      <p className="flex justify-between text-xs text-dim">
        <span>
          {label} <span className="text-faint">({split.battles})</span>
        </span>
        <span className="readout text-bone">{percentLabel(split.rate)}</span>
      </p>
      <span className="mt-1 block h-1 bg-edge" aria-hidden>
        <span className="block h-full bg-achieved" style={{ width: percentLabel(split.rate) }} />
      </span>
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
  const missing = [
    ...(record.stratagems.length ? [] : ['stratagems']),
    ...(record.cards.length ? [] : ['secondary missions']),
    ...(record.primaryMissions.length ? [] : ['primary missions']),
    ...(record.opposingFactions.length ? [] : ['opposing factions']),
  ]
  return (
    <>
      {missing.length ? <p className="text-xs text-faint">Not recorded in these battles: {missing.join(', ')}.</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <RecordTable
            label="Stratagems"
            rows={record.stratagems}
            rowKey={(row) => row.key}
            renderName={(row) => <StratagemName stratagem={row} />}
            columns={[
              { label: 'Uses', cell: (row) => row.uses, tint: 'text-bone' },
              { label: 'CP', cell: (row) => row.cp },
              { label: 'Win', cell: (row) => percentLabel(row.rate), tint: 'text-info' },
            ]}
          />
          {record.bestStratagem && record.worstStratagem ? (
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Best', stratagem: record.bestStratagem },
                { label: 'Worst', stratagem: record.worstStratagem },
              ].map(({ label, stratagem }) => (
                <Highlight
                  key={label}
                  label={`${label} · used in ${RECORD_SAMPLE}+`}
                  name={<StratagemName stratagem={stratagem} />}
                  detail={`${percentLabel(stratagem.rate)} won of ${countLabel(stratagem.battles, 'battle')}`}
                />
              ))}
            </div>
          ) : null}
        </div>
        {record.cards.length ? (
          <div className="space-y-2">
            <RecordTable
              label="Secondary missions"
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
                {[
                  { label: 'Best', card: record.bestCard },
                  { label: 'Worst', card: record.worstCard },
                ].map(({ label, card }) => (
                  <Highlight
                    key={label}
                    label={`${label} · held ${RECORD_SAMPLE}+`}
                    name={<CardName card={card} />}
                    detail={`${oneDecimal(card.average)} VP per battle held`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <RecordTable
          label="Primary missions"
          rows={record.primaryMissions}
          rowKey={(row) => row.key}
          renderName={(row) =>
            row.reference ? (
              <Link to="/missions/$packId/matchups/$you/$opponent" params={row.reference} className={NAME_LINK}>
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
          rows={record.opposingFactions}
          rowKey={(row) => row.faction.slug}
          renderName={(row) => (
            <FactionReferenceLink
              to="/factions/$catalogueId"
              params={{ catalogueId: row.faction.slug }}
              className="flex min-w-0 items-center gap-2 hover:text-info"
            >
              <FactionMark faction={row.faction} size="sm" />
              <span className="font-bold break-words uppercase">{row.faction.displayName}</span>
            </FactionReferenceLink>
          )}
          columns={[
            { label: 'Played', cell: (row) => row.battles, tint: 'text-bone' },
            ...results,
            { label: 'Rate', cell: (row) => percentLabel(row.rate) },
          ]}
        />
        {record.opponents.length ? (
          <RecordTable
            label="Against players"
            rows={record.opponents}
            rowKey={(row) => row.id}
            renderName={(row) => (
              <Link to="/users/$userId" params={{ userId: row.id }} className="flex min-w-0 items-center gap-2 hover:text-info">
                <PlayerAvatar name={row.name} image={row.image} className="size-6 text-3xs" />
                <span className="font-bold break-words uppercase">{row.name}</span>
              </Link>
            )}
            columns={[
              { label: 'Played', cell: (row) => row.battles, tint: 'text-bone' },
              ...results,
              { label: 'Rate', cell: (row) => percentLabel(row.rate) },
            ]}
          />
        ) : null}
      </div>
    </>
  )
}

type Column<T> = { label: string; cell: (row: T) => ReactNode; tint?: string }

const results: Column<{ won: number; drawn: number; lost: number }>[] = [
  { label: 'W', cell: (row) => row.won, tint: 'text-achieved' },
  { label: 'D', cell: (row) => row.drawn },
  { label: 'L', cell: (row) => row.lost, tint: 'text-rust' },
]

/** How many rows a table shows before the reader asks for the rest. */
const TABLE_ROWS = 10

/** A compact table: a name that wraps, then narrow right-aligned counts. */
function RecordTable<T>({
  label,
  rows,
  rowKey,
  renderName,
  columns,
}: {
  label: string
  rows: readonly T[]
  rowKey: (row: T) => string
  renderName: (row: T) => ReactNode
  columns: readonly Column<T>[]
}) {
  const [all, setAll] = useState(false)
  if (!rows.length) return null
  const shown = all ? rows : rows.slice(0, TABLE_ROWS)
  return (
    <section data-record-table={label}>
      <p className="eyebrow">{label}</p>
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
          {shown.map((row) => (
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
      {rows.length > TABLE_ROWS ? (
        <Button variant="link" size="sm" className="mt-1 px-0 text-info" onClick={() => setAll((open) => !open)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </Button>
      ) : null}
    </section>
  )
}

function CardName({ card }: { card: CardRecord }) {
  return card.reference ? (
    <Link to="/missions/$packId/secondaries/$cardId" params={{ packId: card.reference.packId, cardId: card.key }} className={NAME_LINK}>
      {card.name}
    </Link>
  ) : (
    <span className="font-bold break-words uppercase">{card.name}</span>
  )
}

function StratagemName({ stratagem }: { stratagem: StratagemRecord }) {
  return stratagem.reference ? (
    <FactionReferenceLink
      to="/factions/$catalogueId/detachments/$detachmentId"
      params={stratagem.reference}
      hash={`stratagem-${routeSlug(stratagem.name)}`}
      className={NAME_LINK}
    >
      {stratagem.name}
    </FactionReferenceLink>
  ) : (
    <span className="font-bold break-words uppercase">{stratagem.name}</span>
  )
}

/** The best or worst card or stratagem, which only exist once enough of them have been seen often enough to compare. */
function Highlight({ label, name, detail }: { label: string; name: ReactNode; detail: string }) {
  return (
    <div className="min-w-40 flex-1 border border-edge bg-panel p-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-sm">{name}</p>
      <p className="readout mt-1 text-xs text-dim">{detail}</p>
    </div>
  )
}

/** One decimal, because these are averages and a rounded one hides the difference. */
const oneDecimal = (value: number) => value.toFixed(1)
