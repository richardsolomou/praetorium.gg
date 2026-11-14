import { useSyncExternalStore, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { type BattleClock, type ClockMatch, clockMs, remainingMs, runsIn } from '../../../core/battleClock'
import { formatDuration } from './turnTime'

const second = () => Math.floor(Date.now() / 1000) * 1000

function everySecond(tick: () => void) {
  const timer = window.setInterval(tick, 1000)
  return () => window.clearInterval(timer)
}

type Props = { clock: BattleClock; match: ClockMatch; className?: string }

/** The time a side, round or phase has taken, counting up while the battle is in it. */
export function Elapsed({ clock, match, className = '' }: Props) {
  return <Readout running={runsIn(clock, match)} ms={(now) => clockMs(clock, now, match)} format={formatDuration} className={className} />
}

/** The time a side has left under the table's limit, counting down while it holds the clock and past zero once it runs out. */
export function Remaining({ clock, side, className = '' }: { clock: BattleClock; side: number; className?: string }) {
  return (
    <Readout running={runsIn(clock, { side })} ms={(now) => remainingMs(clock, now, side) ?? 0} format={timeLeft} className={className} />
  )
}

function timeLeft(ms: number): ReactNode {
  return ms > 0 ? (
    formatDuration(ms)
  ) : (
    <span className="text-discarded">
      <span className="sr-only">Out of time by </span>−{formatDuration(-ms)}
    </span>
  )
}

type ReadoutProps = { running: boolean; ms: (now: number | null) => number; format: (ms: number) => ReactNode; className: string }

function Readout({ running, ms, format, className }: ReadoutProps) {
  return running ? (
    <Ticking ms={ms} format={format} className={className} />
  ) : (
    <span className={cn('readout', className)}>{format(ms(null))}</span>
  )
}

/** The server cannot know the reader's clock, so the first frame holds a placeholder of the same width. */
function Ticking({ ms, format, className }: Omit<ReadoutProps, 'running'>) {
  const now = useSyncExternalStore(everySecond, second, () => null)
  return <span className={cn('readout', className)}>{now === null ? '–:––' : format(ms(now))}</span>
}
