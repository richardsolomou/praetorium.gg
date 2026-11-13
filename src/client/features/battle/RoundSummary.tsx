import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BattleView } from '../../../core/battleView'
import { battleResult } from '../../battleOutcome'
import { FactionMark } from '../../components/FactionMark'
import { factionQuery } from '../../queries'
import { sideName, type Army, type Side } from '../../sides'
import { readStoredValue, writeStoredValue } from '../../storedValue'
import { useHydrated } from '../../useClientValue'
import { tint } from './battleTints'
import { dueSummary, isBefore, parseRoundMark, roundSummaryStorageKey, sameMark, settledMark, type RoundMark } from './roundMarks'

/**
 * The summary this device owes for the battle as it stands, once per round and once for the end.
 * A summary counts as seen once it is closed, so one left open comes back after a reload, and it
 * closes by itself if an undo takes the battle back before the round it shows.
 */
export function useRoundSummary(view: Pick<BattleView, 'token' | 'status' | 'round' | 'settlementRound'>) {
  // Browser storage holds the furthest summary closed, so this waits for the browser's first render.
  const hydrated = useHydrated()
  const now = settledMark(view)
  const key = roundSummaryStorageKey(view.token)
  const [tracked, setTracked] = useState<{ token: string; at: RoundMark; open: RoundMark | null } | null>(null)
  const current = tracked?.token === view.token ? tracked : null
  if (hydrated && now && !(current && sameMark(current.at, now)))
    setTracked({
      token: view.token,
      at: now,
      // Only moving forward opens one; stepping back by an undo keeps the open one hidden until play reaches it again.
      open:
        current && isBefore(now, current.at)
          ? current.open
          : (dueSummary(parseRoundMark(readStoredValue(key)), now) ?? current?.open ?? null),
    })
  const round = current?.at.round
  const finished = current?.at.finished
  // A device seeing the battle for the first time starts counting from where it stands.
  useEffect(() => {
    if (round !== undefined && !parseRoundMark(readStoredValue(key))) writeStoredValue(key, JSON.stringify({ round, finished }))
  }, [key, round, finished])
  const open = current?.open && now && !isBefore(now, current.open) ? current.open : null
  const close = () => {
    const seen = parseRoundMark(readStoredValue(key))
    if (open && (!seen || isBefore(seen, open))) writeStoredValue(key, JSON.stringify(open))
    setTracked((state) => state && { ...state, open: null })
  }
  return { mark: open, close }
}

type Props = {
  /** The summary to show, or null to close the one showing. */
  mark: RoundMark | null
  view: Pick<BattleView, 'rounds' | 'result' | 'players'>
  sides: Side[]
  onClose: () => void
}

const pad = (round: number) => String(round).padStart(2, '0')

/**
 * The scores between rounds, the way a broadcast cuts to the table's totals: each side's victory
 * points, how they were made and what the round added. Pressing anywhere returns to the battle.
 */
export function RoundSummary({ mark: next, view, sides, onClose }: Props) {
  // Held through the closing transition, so what fades out is what was shown rather than nothing.
  const [mark, setMark] = useState(next)
  if (next && !(mark && sameMark(mark, next))) setMark(next)
  // The root stays mounted while closed, because a dialog that mounts already open skips its entering transition.
  return (
    <DialogPrimitive.Root
      open={Boolean(next)}
      onOpenChange={(open) => (open ? undefined : onClose())}
      onOpenChangeComplete={(open) => (open ? undefined : setMark(null))}
    >
      {mark ? <SummaryScreen mark={mark} view={view} sides={sides} onClose={onClose} /> : null}
    </DialogPrimitive.Root>
  )
}

function SummaryScreen({ mark, view, sides: table, onClose }: Omit<Props, 'mark'> & { mark: RoundMark }) {
  const finished = mark.finished
  const result = finished ? battleResult(table, view) : null
  const [first, second] = table.toSorted((left, right) => right.total - left.total)
  const margin = first && second ? first.total - second.total : 0
  const title = result
    ? result.kind === 'win'
      ? `${sideName(result.side)} ${result.verb}`
      : result.detail
    : `Round ${mark.round} complete`
  const standing =
    first && second
      ? margin === 0
        ? `Level at ${first.total}`
        : `${sideName(first)} ${first.armies.length > 1 ? 'lead' : 'leads'} by ${margin}`
      : null

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Popup
        data-round-summary={finished ? 'final' : mark.round}
        onClick={onClose}
        // Fades in as its contents lift into place and each side slides in from its own edge; leaves faster than it came, above the prompt it gives way to.
        className="group/summary fixed inset-0 z-[55] cursor-pointer overflow-y-auto overscroll-contain bg-void text-bone outline-none transition-opacity duration-220 ease-(--ease-settle) data-ending-style:opacity-0 data-ending-style:duration-160 data-ending-style:ease-in data-starting-style:opacity-0 motion-reduce:transition-none"
      >
        {/* Each side's colour rises from its own edge, so the half a number sits in already says whose it is. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 70% 90% at 0% 20%, color-mix(in srgb, var(--color-side-a) 20%, transparent), transparent 70%), radial-gradient(ellipse 70% 90% at 100% 20%, color-mix(in srgb, var(--color-side-b) 20%, transparent), transparent 70%)',
          }}
        />
        <div aria-hidden className="construction-grid fixed" />
        <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col overflow-x-clip transition-transform duration-320 ease-(--ease-settle) group-data-ending-style/summary:translate-y-2 group-data-ending-style/summary:duration-160 group-data-ending-style/summary:ease-in group-data-starting-style/summary:translate-y-4 motion-reduce:transition-none justify-center gap-6 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:gap-10 sm:px-8">
          <header className="text-center">
            {finished ? <p className="eyebrow">Battle over</p> : null}
            <DialogPrimitive.Title
              className={cn(
                'mt-1 text-3xl leading-none font-bold text-balance break-words uppercase sm:text-5xl',
                result?.kind === 'win' && tint(result.side.index).text,
              )}
            >
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-dim sm:text-base">
              {result?.kind === 'win' ? result.detail : standing}
            </DialogPrimitive.Description>
          </header>

          {/* Both sides share four rows, so a pair's two names above one score still leave the scores and their parts level. */}
          <div className="grid grid-cols-2 grid-rows-[repeat(4,auto)] gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-x-8">
            {table.map((side, position) => (
              <SideTotals key={side.index} side={side} round={mark.round} end={position > 0} />
            ))}
            {/* Between the sides from `sm`; a phone keeps the height for the scores, and the title already names the round. */}
            <div className="order-2 row-span-4 hidden justify-center self-center sm:flex">
              <div className="part grid min-w-36 place-items-center border-runner-hi px-5 py-5 text-center transition-transform duration-320 ease-(--ease-settle) group-data-starting-style/summary:scale-90 motion-reduce:transition-none">
                <span className="font-display text-2xs font-semibold tracking-label text-dim uppercase">
                  {finished ? 'Final' : 'Round'}
                </span>
                <span className="font-display text-7xl leading-none font-bold tracking-[-0.04em] tabular-nums">{pad(mark.round)}</span>
                <span className="mt-1 font-display text-2xs font-semibold tracking-label text-faint uppercase">of {pad(view.rounds)}</span>
              </div>
            </div>
          </div>

          <RoundByRound sides={table} round={mark.round} rounds={view.rounds} />

          <footer className="flex flex-col items-center gap-2">
            <DialogPrimitive.Close
              render={<Button className="min-h-11 min-w-56 rounded-xl font-display text-sm font-bold" />}
              onClick={(event) => event.stopPropagation()}
            >
              {finished ? 'See the battle report' : `Continue to round ${mark.round + 1}`}
            </DialogPrimitive.Close>
            <p className="text-xs text-faint">or tap anywhere</p>
          </footer>
        </div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function SideTotals({ side, round, end }: { side: Side; round: number; end: boolean }) {
  const colours = tint(side.index)
  const team = side.armies.length > 1
  const gained = side.rounds.find((entry) => entry.round === round)?.total ?? 0
  const parts = [
    { label: 'Primary', value: side.primary },
    { label: 'Secondary', value: side.secondary },
    ...(side.paintedPoints ? [{ label: 'Battle ready', value: side.paintedPoints }] : []),
    { label: 'CP', value: side.cp },
  ]
  return (
    <section
      data-round-side={side.index}
      aria-label={sideName(side)}
      className={cn(
        'relative isolate row-span-4 grid min-w-0 grid-rows-subgrid transition-transform duration-400 ease-(--ease-settle) motion-reduce:transition-none',
        end
          ? 'order-3 text-right group-data-starting-style/summary:translate-x-8'
          : 'order-1 group-data-starting-style/summary:-translate-x-8',
      )}
    >
      <FactionWatermark army={side.armies[0]} end={end} />
      {/* Each army of an allied side on its own line, smaller; a long name wraps rather than losing its end. */}
      <ul className={cn('grid content-start', team && 'gap-1.5 sm:gap-2')}>
        {side.armies.map((army) => (
          <li key={army.playerId} className="min-w-0">
            <p
              className={cn(
                'font-display leading-tight font-bold [overflow-wrap:anywhere] uppercase',
                team ? 'text-sm sm:text-xl' : 'text-lg sm:text-3xl',
                colours.text,
              )}
            >
              {army.playerName}
            </p>
            <FactionName army={army} />
          </li>
        ))}
      </ul>
      <p className={cn('mt-3 flex items-baseline gap-2 sm:mt-5', end && 'flex-row-reverse')}>
        <span className={cn('figure animate-figure text-7xl leading-[0.85] font-bold sm:text-9xl', colours.text)}>{side.total}</span>
        <span className="font-display text-xs font-semibold tracking-label text-dim uppercase">VP</span>
      </p>
      <p className={cn('mt-2 flex items-baseline gap-1.5 text-sm', end && 'flex-row-reverse')}>
        <span className={cn('figure rounded-md border px-1.5 font-bold', colours.mark)}>+{gained}</span>
        <span className="text-dim">this round</span>
      </p>
      <dl className={cn('mt-4 grid gap-y-1.5 border-t border-edge pt-3 sm:mt-6 sm:flex sm:gap-x-6', end && 'sm:justify-end')}>
        {parts.map((part) => (
          <div key={part.label} className={cn('flex items-baseline justify-between gap-2 sm:block', end && 'flex-row-reverse')}>
            <dt className="font-display text-3xs font-semibold tracking-label whitespace-nowrap text-dim uppercase sm:text-2xs">
              {part.label}
            </dt>
            <dd className="figure text-lg leading-tight font-bold sm:text-2xl">{part.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** The army's faction, which takes one small read of its own. */
function useFaction(army: Army | undefined) {
  const catalogueId = army?.roster?.built?.catalogueId ?? ''
  return useQuery({ ...factionQuery(catalogueId), enabled: Boolean(catalogueId) }).data
}

function FactionName({ army }: { army: Army }) {
  const faction = useFaction(army)
  if (!faction) return null
  return <p className="text-xs text-dim [overflow-wrap:anywhere] sm:text-sm">{faction.displayName}</p>
}

/** The side's faction emblem behind its score, faint enough that the numbers stay the only thing read. */
function FactionWatermark({ army, end }: { army: Army | undefined; end: boolean }) {
  const faction = useFaction(army)
  if (!faction?.icon) return null
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute -top-8 -z-10 opacity-10 sm:-top-16',
        end ? '-right-10 sm:-right-24' : '-left-10 sm:-left-24',
      )}
    >
      <FactionMark faction={{ ...faction, edition: null }} className="size-40 sm:size-80" />
    </div>
  )
}

/** Each round's points side by side: rounds played solid, the one just played doubled, the rest dashed. */
function RoundByRound({ sides: table, round, rounds }: { sides: Side[]; round: number; rounds: number }) {
  const columns = Array.from({ length: rounds }, (_, index) => index + 1)
  return (
    <div className="part mx-auto w-full max-w-3xl p-3 sm:p-4">
      <table className="w-full table-fixed text-center">
        <caption className="sr-only">Victory points by round</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[28%] text-left font-display text-3xs font-semibold tracking-label text-dim uppercase sm:text-2xs">
              Round
            </th>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-0.5 pb-2 align-bottom">
                <span
                  className={cn(
                    'font-display text-2xs font-bold tabular-nums',
                    column === round ? 'text-bone' : column < round ? 'text-dim' : 'text-faint',
                  )}
                >
                  {column}
                </span>
                <span aria-hidden className="line-segment mt-1" data-line={column < round ? 'done' : column === round ? 'now' : 'todo'} />
              </th>
            ))}
            <th
              scope="col"
              className="w-[16%] pb-2 align-bottom font-display text-3xs font-semibold tracking-label text-dim uppercase sm:text-2xs"
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map((side) => {
            const colours = tint(side.index)
            return (
              <tr key={side.index} className="border-t border-edge">
                <th scope="row" className={cn('py-2 pr-1 text-left text-2xs leading-tight font-bold uppercase sm:text-sm', colours.text)}>
                  {side.armies.map((army) => (
                    <span key={army.playerId} className="block [overflow-wrap:anywhere]">
                      {army.playerName}
                    </span>
                  ))}
                </th>
                {columns.map((column) => (
                  <td key={column} className={cn('figure py-2 text-sm sm:text-base', column <= round ? 'text-bone' : 'text-faint')}>
                    {column <= round ? (side.rounds.find((entry) => entry.round === column)?.total ?? 0) : '–'}
                  </td>
                ))}
                <td className={cn('figure py-2 text-base font-bold sm:text-lg', colours.text)}>{side.total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
