import { refuse, sameSide } from './battlePrimitives'
import type { PlayerId, BattleMoment, Command, Refusal, PlayerState, BattleState } from './battle'
import { PHASES } from './battlePhases'
import { holdsSecondary } from './battleSecondaries'

/**
 * The moment being played, or null outside play.
 *
 * Moments are ordered by `momentOrder`, so an action recorded late can be placed
 * against the moments since without storing a second clock.
 */
export function playedMoment(state: BattleState): BattleMoment | null {
  return state.status === 'playing' && state.round > 0 && state.activePlayerId
    ? { round: state.round, phase: state.phase, turn: state.activePlayerId }
    : null
}

export function momentOrder(state: BattleState, moment: BattleMoment): number {
  const turn = sameSide(state, moment.turn, state.firstPlayerId ?? '') ? 0 : 1
  return ((moment.round - 1) * 2 + turn) * PHASES.length + PHASES.indexOf(moment.phase)
}

/**
 * The earlier moments a missed action may name: this battle round and the one before.
 *
 * Bounded so a correction stays within what the table can still remember, and so the
 * usage limits, CP and card holdings it is judged against stay those of a recent turn.
 */
export function missedMoments(state: BattleState): BattleMoment[] {
  const now = playedMoment(state)
  if (!now || !state.firstPlayerId) return []
  const second = state.players.find((player) => !sameSide(state, player.id, state.firstPlayerId ?? ''))?.id
  const turns = [state.firstPlayerId, ...(second ? [second] : [])]
  const latest = momentOrder(state, now)
  return [...new Set([Math.max(1, state.round - 1), state.round])]
    .flatMap((round) => turns.flatMap((turn) => PHASES.map((phase) => ({ round, phase, turn }))))
    .filter((moment) => momentOrder(state, moment) < latest)
}

export function missedMomentRefusal(state: BattleState, moment: BattleMoment): Refusal | null {
  return missedMoments(state).some(
    (candidate) => candidate.round === moment.round && candidate.phase === moment.phase && sameSide(state, candidate.turn, moment.turn),
  )
    ? null
    : refuse('missed-moment', 'a missed action belongs to an earlier phase of this battle round or the previous one')
}

export function missedScoreRefusal(
  state: BattleState,
  by: PlayerId,
  player: PlayerState,
  command: Extract<Command, { kind: 'score-settlement' }>,
  moment: BattleMoment,
): Refusal | null {
  const refusal = missedMomentRefusal(state, moment)
  if (refusal) return refusal
  if (command.round !== undefined) return refuse('missed-unsupported', 'a missed score names its moment rather than a settlement round')
  for (const score of command.scores) {
    if (score.category === 'primary') {
      if (score.final) return refuse('missed-unsupported', 'end-of-battle points cannot be recorded late')
      continue
    }
    if (!holdsSecondary(player, score.key)) return refuse('unknown-secondary', 'that is not one of your secondaries')
    if (player.secondaryStatus[score.key] !== 'active')
      return refuse('missed-unsupported', 'only a secondary mission still held can be scored late')
    if ((player.secondaryDrawnAt[score.key] ?? -1) > momentOrder(state, moment))
      return refuse('missed-unsupported', 'that secondary mission had not been drawn yet')
  }
  return null
}
