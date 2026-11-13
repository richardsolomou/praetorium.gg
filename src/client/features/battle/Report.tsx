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

/** Short enough for the gutter, and still distinct from every other phase. */
const PHASE_LABELS: Record<string, string> = {
  command: 'cmd',
  movement: 'move',
  shooting: 'shoot',
  charge: 'chrg',
  fight: 'fight',
  end: 'end',
}

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
      <div
        data-battle-report-scroll
        ref={scroll}
        onScroll={(event) => (scrollTop.current = event.currentTarget.scrollTop)}
        className="mt-3 h-72 overflow-x-hidden overflow-y-auto pr-1"
        style={{ contain: 'layout' }}
      >
        {visible.length ? (
          <ol className="w-full space-y-1">
            {visible.map((entry, index) => (
              <Fragment key={entry.seq}>
                {index === 0 || date(visible[index - 1]!.at) !== date(entry.at) ? (
                  <li className="eyebrow border-b border-edge pb-1 text-faint">{date(entry.at)}</li>
                ) : null}
                <li
                  className={cn(
                    'grid w-full grid-cols-[3.5rem_minmax(0,1fr)] gap-2 text-sm sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-3',
                    openedAt !== null && entry.seq > openedAt && 'animate-in duration-300 ease-settle fade-in-0 slide-in-from-top-2',
                  )}
                >
                  <span className="readout text-right text-xs text-dim">
                    {time(entry.at)}
                    <span className="block text-3xs text-faint">
                      {entry.round ? `R${entry.round} ${PHASE_LABELS[entry.phase] ?? entry.phase}` : 'setup'}
                    </span>
                  </span>
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
              </Fragment>
            ))}
            {hidden > 0 ? (
              <li>
                <Button variant="ghost" size="xs" className="mt-1 text-azure" onClick={() => setShownCount((current) => current + WINDOW)}>
                  Show earlier events ({hidden} more)
                </Button>
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="text-xs text-dim">No command point events yet.</p>
        )}
      </div>
      {reading && readingSide ? <StratagemDialog side={readingSide} used={reading} onClose={() => setReading(null)} /> : null}
    </>
  )
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
  const results = useQueries({
    queries: side.armies.map((army) => {
      const request = armyRulesRequest(army.roster)
      return detachmentRulesQuery(request.catalogueId, request.detachmentNames)
    }),
  })
  const stratagem = side.stratagems.find((candidate) => candidate.key === used.key)
  if (!stratagem) return null
  return (
    <BattlePromptDialog open onOpenChange={(open) => !open && onClose()} minimizedLabel={used.name} resumeLabel="Return to stratagem">
      <StratagemDetails
        stratagem={stratagem}
        written={writtenStratagem(
          results.flatMap((result) => (result.data ? [result.data] : [])),
          used.key,
        )}
        pending={results.some((result) => result.isLoading)}
      />
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
          <div key={index} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-3" aria-hidden>
            <Skeleton className="ml-auto h-7 w-10" />
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
