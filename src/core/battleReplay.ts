import { emptyBattle, replay, type LoggedCommand, type Phase, type PlayerId } from './battle'

export type ReplayPoint = { seq: number; round: number; phase: Phase; at: number; text: string; activity: 'phase' | 'action' }

/** Every saved command is a stop, including an action later undone and the undo itself. */
export function battleTimeline(
  playerIds: readonly PlayerId[],
  log: readonly LoggedCommand[],
  playerSides?: readonly number[],
  automatedPlayerIds: readonly PlayerId[] = [],
): Omit<ReplayPoint, 'text'>[] {
  const state = emptyBattle(playerIds, playerSides, automatedPlayerIds)
  const moments = new Map<number, { round: number; phase: Phase }>()
  for (const { entry } of replay(state, log)) moments.set(entry.seq, { round: state.round, phase: state.phase })
  let last = { round: 0, phase: state.phase }
  return log.map((entry) => {
    last = moments.get(entry.seq) ?? last
    return {
      seq: entry.seq,
      round: last.round,
      phase: last.phase,
      at: entry.at,
      activity: entry.command.kind === 'advance' ? ('phase' as const) : ('action' as const),
    }
  })
}

export function battleLogThroughSeq(log: readonly LoggedCommand[], seq: number): LoggedCommand[] {
  return log.filter((entry) => entry.seq <= seq)
}
