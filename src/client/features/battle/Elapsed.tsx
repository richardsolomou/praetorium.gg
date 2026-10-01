import { useSyncExternalStore } from 'react'
import { type BattleClock, type ClockMatch, clockMs, runsIn } from '../../../core/battleClock'
import { formatDuration } from './turnTime'

const second = () => Math.floor(Date.now() / 1000) * 1000

function everySecond(tick: () => void) {
  const timer = window.setInterval(tick, 1000)
  return () => window.clearInterval(timer)
}

type Props = { clock: BattleClock; match: ClockMatch; className?: string }

/** The time a side, round or phase has taken, counting up while the battle is in it. */
export function Elapsed({ clock, match, className = '' }: Props) {
  return runsIn(clock, match) ? (
    <Ticking clock={clock} match={match} className={className} />
  ) : (
    <span className={`readout ${className}`}>{formatDuration(clockMs(clock, null, match))}</span>
  )
}

/** The server cannot know the reader's clock, so the first frame holds a placeholder of the same width. */
function Ticking({ clock, match, className }: Required<Props>) {
  const now = useSyncExternalStore(everySecond, second, () => null)
  return <span className={`readout ${className}`}>{now === null ? '–:––' : formatDuration(clockMs(clock, now, match))}</span>
}
