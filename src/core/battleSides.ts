import { sidePlayers } from './battlePrimitives'
import { teamDisposition, teamDispositionChoices } from './teamDisposition'
import { teamWarlord, teamWarlordChoices } from './teamWarlord'
import type { PlayerId, Command, PlayerState, BattleState } from './battle'

/**
 * The Force Disposition a side plays, which decides the primary it is set.
 *
 * Where the side's lists name no single card and the side has not said which it
 * plays, the answer is nothing at all — taking the first seat's card would have
 * played one ally's choice for both of them without ever saying so.
 */
export function sideDisposition(state: BattleState, side: number): string | null {
  const disposition = teamDisposition(
    sidePlayers(state, side).map((player) => player.roster),
    state.sideDispositions[side] ?? null,
    state.sealedEventToken !== null,
  )
  // A battle already being played is never left without a mission. Setup refuses to
  // start one until each side has said, so this only answers for battles begun before
  // the question was asked — and it answers what they were already being played on.
  if (disposition || state.status === 'setup') return disposition
  return sideCaptain(state, side).roster?.built?.disposition ?? null
}

/** The cards a side could play, which is what it is asked to choose between. */
export function sideDispositionChoices(state: BattleState, side: number): string[] {
  return teamDispositionChoices(
    sidePlayers(state, side).map((player) => player.roster),
    state.sealedEventToken !== null,
  )
}

/** The player whose Warlord leads a side; null while allies have not said which of their Warlords it is. */
export function sideWarlord(state: BattleState, side: number): PlayerId | null {
  return teamWarlord(sidePlayers(state, side), state.sideWarlords[side] ?? null)
}

/** The players on a side whose lists name a Warlord, which allies choose between. */
export function sideWarlordChoices(state: BattleState, side: number): PlayerId[] {
  return teamWarlordChoices(sidePlayers(state, side))
}

export function sideCaptain(state: BattleState, side: number): PlayerState {
  return state.players.find((player) => player.side === side)!
}

/** Whether the command names an army other than the one recording it. */
export function namesAnotherArmy(command: Command, actor: PlayerState): boolean {
  return 'playerId' in command && Boolean(command.playerId) && command.playerId !== actor.id
}

function armyCommand(command: Command): boolean {
  return [
    'attach-roster',
    'detach-roster',
    'set-unit',
    'wound-unit',
    'damage-unit',
    'deploy-unit',
    'set-unit-formation',
    'set-painted',
  ].includes(command.kind)
}

/** The player a command names, or whoever sent it. */
export function commandTarget(command: Command, by: PlayerId): PlayerId {
  return 'playerId' in command && command.playerId ? command.playerId : by
}

/** Resolves the army once for both choosing cards from its deck and recording the draw. */
export function commandArmy(state: BattleState, by: PlayerId, command: Command): PlayerState | undefined {
  const actor = state.players.find((candidate) => candidate.id === by)
  return actor ? targetArmy(state, actor, command) : undefined
}

/**
 * The army a command acts on.
 *
 * Live actions may name another player, while commands without a target retain the
 * actor-based meaning used by existing log entries.
 */
export function targetArmy(state: BattleState, actor: PlayerState, command: Command): PlayerState {
  const named = 'playerId' in command && command.playerId ? command.playerId : null
  const target = (named ? state.players.find((candidate) => candidate.id === named) : undefined) ?? actor
  return armyCommand(command) ? target : sideCaptain(state, target.side)
}

/**
 * The side a score command would credit, resolved the same way `validate` does.
 *
 * Exported for the score-cap check, which needs the mission pack and so cannot live
 * in this IO-free file: resolving the target stays made in one place even so.
 */
export function scoringTarget(
  state: BattleState,
  by: PlayerId,
  command: Command,
):
  | (Pick<
      PlayerState,
      'side' | 'primary' | 'secondary' | 'primaryByRound' | 'secondaryByRound' | 'finalPrimary' | 'secondaryMode' | 'scored'
    > & {
      disposition: string | null
    })
  | null {
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor) return null
  const target = targetArmy(state, actor, command)
  return {
    side: target.side,
    disposition: sideDisposition(state, target.side),
    primary: target.primary,
    secondary: target.secondary,
    primaryByRound: target.primaryByRound,
    finalPrimary: target.finalPrimary,
    secondaryByRound: target.secondaryByRound,
    secondaryMode: target.secondaryMode,
    scored: target.scored,
  }
}
