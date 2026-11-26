import { useQueries, useQuery } from '@tanstack/react-query'
import { Timer } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ReportEntry } from '../../../core/battleReport'
import { useDateFormatting } from '../../dates'
import { detachmentRulesQuery, reportQuery } from '../../queries'
import type { Side } from '../../sides'
import { BattlePromptDialog } from './BattlePromptDialog'
import { armyRulesRequest, writtenStratagem } from './sideRules'
import { StratagemDetails } from './Stratagems'
import { formatDuration } from './turnTime'
import { CARD_NAME_LINK, tint } from './battleTints'
import { PlayerTint } from './battleColours'

type ReportPlayer = { id: string; name: string; className: string }

/** Names in the report take their side's tint, under each player's own colour where the battle sets one. */
export const reportPlayers = (players: readonly { id: string; name: string; side: number }[]): ReportPlayer[] =>
  players.map((player) => ({ id: player.id, name: player.name, className: tint(player.side).text }))

const PHASE_LABELS: Record<string, string> = {
  command: 'Command',
  movement: 'Movement',
  shooting: 'Shooting',
  charge: 'Charge',
  fight: 'Fight',
  end: 'End',
}

/** The moment a run of lines belongs to, said once above them rather than beside every line. */
const momentOf = (entry: ReportEntry) => (entry.round ? `Round ${entry.round} · ${PHASE_LABELS[entry.phase] ?? entry.phase}` : 'Setup')

const NO_PLAYERS: readonly ReportPlayer[] = []
const NO_SIDES: readonly Side[] = []

type UsedStratagem = NonNullable<ReportEntry['stratagem']>

/** The log grows all game and refetches on every change; only this many lines render until asked. */
const WINDOW = 100

/**
 * The account of the battle, read back out of the log.
 *
 * Nothing is stored to make this possible — the log is already a complete record,
 * so this is a rendering of it. Newest first, and windowed, because it grows all
 * game and the page refetches on every change.
 */
export function Report({
  token,
  players = NO_PLAYERS,
  sides = NO_SIDES,
  entries: suppliedEntries,
}: {
  token: string
  players?: readonly ReportPlayer[]
  sides?: readonly Side[]
  entries?: readonly ReportEntry[]
}) {
  const { date, time } = useDateFormatting()
  const reportResult = useQuery(reportQuery(token, suppliedEntries === undefined))
  const fetchedEntries = reportResult.data
  const entries = suppliedEntries ?? fetchedEntries
  const [filter, setFilter] = useState<'all' | 'cp'>('all')
  const [shownCount, setShownCount] = useState(WINDOW)
  const [reading, setReading] = useState<UsedStratagem | null>(null)
  const readingSide = reading ? sideHolding(sides, reading) : undefined
  const scroll = useRef<HTMLDivElement>(null)
  const scrollTop = useRef(0)
  useLayoutEffect(() => {
    if (suppliedEntries && scroll.current) scroll.current.scrollTop = scrollTop.current
  }, [suppliedEntries])
  // Events that arrive while the log is open slide in at the top; the ones it opened with, or reveals later, stay still.
  const [openedAt, setOpenedAt] = useState<number | null>(null)
  const latest = entries?.at(-1)?.seq ?? null
  if (openedAt === null && latest !== null) setOpenedAt(latest)
  const filtered = (filter === 'cp' ? (entries ?? []).filter(isCommandPointEntry) : (entries ?? [])).toReversed()
  const visible = filtered.slice(0, shownCount)
  const hidden = filtered.length - visible.length

  if (suppliedEntries === undefined && reportResult.isPending) return <ReportSkeleton />
  if (!entries?.length) return <p className="mt-3 text-xs text-dim">Nothing has happened yet.</p>

  return (
    <>
      <ToggleGroup
        value={[filter]}
        onValueChange={(value) => {
          if (value[0] === 'all' || value[0] === 'cp') setFilter(value[0])
        }}
        variant="outline"
        size="sm"
        className="mt-3"
        aria-label="Filter battle events"
      >
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="cp">CP only</ToggleGroupItem>
      </ToggleGroup>
      <section
        data-battle-report-scroll
        aria-label="Battle events"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll the event list.
        tabIndex={0}
        ref={scroll}
        onScroll={(event) => (scrollTop.current = event.currentTarget.scrollTop)}
        // A phone scrolls the log with the page: a second scroller inside it traps the thumb and hides the end of the page.
        className="mt-3 overflow-x-clip focus-visible:outline-2 focus-visible:outline-primary lg:h-72 lg:overflow-y-auto lg:pr-1"
        style={{ contain: 'layout' }}
      >
        {visible.length ? (
          <ol className="w-full space-y-3">
            {groupsOf(visible, date).map((group, index, groups) => (
              <Fragment key={group.entries[0]!.seq}>
                {index === 0 || groups[index - 1]!.day !== group.day ? <li className="text-xs text-faint">{group.day}</li> : null}
                <li data-report-group>
                  <p className="border-b border-edge pb-1 text-xs font-medium text-dim">{group.moment}</p>
                  <ol className="mt-1.5 space-y-1">
                    {group.entries.map((entry) => (
                      <li
                        key={entry.seq}
                        className={cn(
                          'grid w-full grid-cols-[4.25rem_minmax(0,1fr)] gap-2 text-sm sm:gap-3',
                          openedAt !== null && entry.seq > openedAt && 'animate-in duration-300 ease-settle fade-in-0 slide-in-from-top-2',
                        )}
                      >
                        <span className="readout pt-0.5 text-right text-xs whitespace-nowrap text-faint">{time(entry.at)}</span>
                        <span className="min-w-0 break-words text-bone">
                          <EntryText
                            text={entry.missed ? entry.text.slice(0, -entry.missed.length) : entry.text}
                            stratagem={entry.stratagem && sideHolding(sides, entry.stratagem) ? entry.stratagem : undefined}
                            players={players}
                            onRead={setReading}
                          />
                          {entry.missed ? <span className="text-discarded">{colourNames(entry.missed, players)}</span> : null}
                          {entry.elapsed ? <TimeTaken elapsed={entry.elapsed} /> : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              </Fragment>
            ))}
            {hidden > 0 ? (
              <li>
                <Button
                  variant="ghost"
                  size="xs"
                  className="mt-1 text-parchment"
                  onClick={() => setShownCount((current) => current + WINDOW)}
                >
                  Show earlier events ({hidden} more)
                </Button>
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="text-xs text-dim">No command point events yet.</p>
        )}
      </section>
      {reading && readingSide ? <StratagemDialog side={readingSide} used={reading} onClose={() => setReading(null)} /> : null}
    </>
  )
}

/** Neighbouring lines from the same day, round and phase, which share one heading. */
function groupsOf(entries: readonly ReportEntry[], date: (at: number) => string) {
  const groups: { day: string; moment: string; entries: ReportEntry[] }[] = []
  for (const entry of entries) {
    const day = date(entry.at)
    const moment = momentOf(entry)
    const last = groups.at(-1)
    if (last && last.day === day && last.moment === moment) last.entries.push(entry)
    else groups.push({ day, moment, entries: [entry] })
  }
  return groups
}

function sideHolding(sides: readonly Side[], used: UsedStratagem) {
  return sides.find(
    (side) => side.armies.some((army) => army.playerId === used.playerId) && side.stratagems.some((s) => s.key === used.key),
  )
}

/** A line with its stratagem's name made into the way to read that stratagem. */
function EntryText({
  text,
  stratagem,
  players,
  onRead,
}: {
  text: string
  stratagem: UsedStratagem | undefined
  players: readonly ReportPlayer[]
  onRead: (used: UsedStratagem) => void
}) {
  // From the end, because the player's name comes first and may contain the stratagem's.
  const at = stratagem ? text.lastIndexOf(stratagem.name) : -1
  if (!stratagem || at === -1) return colourNames(text, players)
  return (
    <>
      {colourNames(text.slice(0, at), players)}
      <button
        type="button"
        aria-label={`About ${stratagem.name}`}
        className={cn('text-left', CARD_NAME_LINK)}
        onClick={() => onRead(stratagem)}
      >
        {stratagem.name}
      </button>
      {colourNames(text.slice(at + stratagem.name.length), players)}
    </>
  )
}

/** Fetches the card only when asked, since a spectator's screen has no other use for the side's rules. */
function StratagemDialog({ side, used, onClose }: { side: Side; used: UsedStratagem; onClose: () => void }) {
  const requests = side.armies.map((army) => armyRulesRequest(army.roster))
  const results = useQueries({
    queries: requests.map((request) => detachmentRulesQuery(request.catalogueId, request.detachmentNames)),
  })
  const stratagem = side.stratagems.find((candidate) => candidate.key === used.key)
  if (!stratagem) return null
  const written = results
    .map((result, at) => {
      const found = result.data ? writtenStratagem([result.data], used.key) : undefined
      return found && { ...found, catalogueId: requests[at]!.catalogueId }
    })
    .find(Boolean)
  return (
    <BattlePromptDialog open onOpenChange={(open) => !open && onClose()} minimizedLabel={used.name} resumeLabel="Return to stratagem">
      <StratagemDetails stratagem={stratagem} written={written} pending={results.some((result) => result.isLoading)} />
    </BattlePromptDialog>
  )
}

/** The time a phase took, beside the line that ends it, and the turn's when the line ends that too. */
function TimeTaken({ elapsed }: { elapsed: NonNullable<ReportEntry['elapsed']> }) {
  return (
    <span className="readout ml-1.5 inline-flex items-center gap-1 align-baseline text-xs whitespace-nowrap text-dim">
      <Timer aria-hidden className="size-3 self-center" />
      <span className="sr-only">Phase took</span>
      {formatDuration(elapsed.phase)}
      {elapsed.turn === null ? null : (
        <>
          <span aria-hidden>·</span>
          <span className="sr-only">, turn took</span>
          <span aria-hidden>turn</span> {formatDuration(elapsed.turn)}
        </>
      )}
    </span>
  )
}

function ReportSkeleton() {
  return (
    <div className="mt-3" aria-label="Loading battle events">
      <Skeleton className="h-7 w-28" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-2 sm:gap-3" aria-hidden>
            <Skeleton className="ml-auto h-4 w-10" />
            <Skeleton className={`h-4 ${index % 3 === 0 ? 'w-3/4' : 'w-full'}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Each player keeps one colour across both devices, so a line says who acted before you read it. */
function colourNames(text: string, players: readonly ReportPlayer[]) {
  const named = players.filter((player) => player.name).toSorted((a, b) => b.name.length - a.name.length)
  if (!named.length) return text

  const parts: (string | { key: string; id: string; name: string; className: string })[] = []
  let rest = text
  let guard = 0
  while (rest && guard++ < 100) {
    let at = -1
    let hit: ReportPlayer | null = null
    for (const player of named) {
      const found = rest.indexOf(player.name)
      if (found !== -1 && (at === -1 || found < at)) {
        at = found
        hit = player
      }
    }
    if (!hit || at === -1) break
    if (at) parts.push(rest.slice(0, at))
    parts.push({ key: `${hit.id}-${parts.length}`, id: hit.id, name: hit.name, className: hit.className })
    rest = rest.slice(at + hit.name.length)
  }
  if (rest) parts.push(rest)

  return parts.map((part) =>
    typeof part === 'string' ? (
      part
    ) : (
      <PlayerTint key={part.key} playerId={part.id} className={`font-semibold ${part.className}`}>
        {part.name}
      </PlayerTint>
    ),
  )
}

function isCommandPointEntry(entry: { commandKind: string; text: string }) {
  return ['adjust-cp', 'use-stratagem'].includes(entry.commandKind) || /command points?|\bCP\b/i.test(entry.text)
}
