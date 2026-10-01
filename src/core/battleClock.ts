import { applyEntry, emptyBattle, reduceBattle, type BattleState, type LoggedCommand, type Phase, type PlayerId } from './battle'

/** The time a side spent in one phase of one battle round. */
export type ClockSpan = { side: number; round: number; phase: Phase; ms: number }

export type BattleClock = {
  /** Settled time, in the order each side, round and phase was first entered. */
  spans: ClockSpan[]
  /** Where time is accruing since the latest command, or null while paused or outside play. */
  running: (Omit<ClockSpan, 'ms'> & { since: number }) | null
  paused: boolean
}

/** Whose turn and phase the battle is in, whether or not the timer is paused. */
function position(state: BattleState): Omit<ClockSpan, 'ms'> | null {
  if (state.status !== 'playing' || state.completionPending) return null
  const side = state.players.find((player) => player.id === state.activePlayerId)?.side
  return side === undefined ? null : { side, round: state.round, phase: state.phase }
}

/** What a phase advance closed: the phase's time so far and, where the turn ended with it, the turn's. */
export type AdvanceTime = { phase: number; turn: number | null }

type Seats = [
  playerIds: readonly PlayerId[],
  log: readonly LoggedCommand[],
  playerSides?: readonly number[],
  automatedPlayerIds?: readonly PlayerId[],
]

/**
 * How long each side spent in each phase, as the table lived it.
 *
 * The fold skips undone commands, so it would hand a turn that was rewound into to
 * the side whose turn it was rewound from. This walks every logged command instead,
 * undone ones included, and gives each gap between commands to wherever the battle
 * stood during it. Returning to a phase adds to its time rather than restarting it.
 * Each undo refolds the log so far, which bounds the work by undos times log length.
 */
function walk(...[playerIds, log, playerSides, automatedPlayerIds = []]: Seats) {
  let state = emptyBattle(playerIds, playerSides, automatedPlayerIds)
  const spans = new Map<string, ClockSpan>()
  const advances = new Map<number, AdvanceTime>()
  let running: BattleClock['running'] = null
  let stood: Omit<ClockSpan, 'ms'> | null = null
  for (const [index, entry] of log.entries()) {
    if (running) {
      const key = `${running.side}:${running.round}:${running.phase}`
      const span = spans.get(key) ?? { side: running.side, round: running.round, phase: running.phase, ms: 0 }
      span.ms += Math.max(0, entry.at - running.since)
      spans.set(key, span)
    }
    if (entry.command.kind === 'undo') state = reduceBattle(playerIds, log.slice(0, index + 1), playerSides, automatedPlayerIds)
    else applyEntry(state, entry)
    const at = position(state)
    if (stood && entry.command.kind === 'advance') {
      const { side, round, phase } = stood
      const turnEnded = !at || at.side !== side || at.round !== round
      advances.set(entry.seq, {
        phase: settledMs(spans.values(), { side, round, phase }),
        turn: turnEnded ? settledMs(spans.values(), { side, round }) : null,
      })
    }
    stood = at
    running = at && !state.clockPaused ? { ...at, since: entry.at } : null
  }
  return { clock: { spans: [...spans.values()], running, paused: state.clockPaused }, advances }
}

export const battleClock = (...seats: Seats): BattleClock => walk(...seats).clock

/** What each phase advance closed, by its sequence number, for the report to say beside it. */
export const advanceTimes = (...seats: Seats): ReadonlyMap<number, AdvanceTime> => walk(...seats).advances

export type ClockMatch = Partial<Omit<ClockSpan, 'ms'>>

const matches = (span: Omit<ClockSpan, 'ms'>, match: ClockMatch) =>
  (match.side === undefined || span.side === match.side) &&
  (match.round === undefined || span.round === match.round) &&
  (match.phase === undefined || span.phase === match.phase)

/** Whether the time matching every given field is still accruing. */
export const runsIn = (clock: BattleClock, match: ClockMatch): boolean => clock.running !== null && matches(clock.running, match)

const settledMs = (spans: Iterable<ClockSpan>, match: ClockMatch) =>
  [...spans].reduce((total, span) => total + (matches(span, match) ? span.ms : 0), 0)

/** The time matching every given field, counting the running stretch up to `now` when there is one. */
export function clockMs(clock: BattleClock, now: number | null, match: ClockMatch): number {
  return (
    settledMs(clock.spans, match) + (clock.running && now !== null && runsIn(clock, match) ? Math.max(0, now - clock.running.since) : 0)
  )
}

/** The latest battle round in which a side has played, or null before its first turn. */
export function latestTurnRound(clock: BattleClock, side: number): number | null {
  const rounds = [...clock.spans, ...(clock.running ? [clock.running] : [])].filter((span) => span.side === side).map((span) => span.round)
  return rounds.length ? Math.max(...rounds) : null
}
