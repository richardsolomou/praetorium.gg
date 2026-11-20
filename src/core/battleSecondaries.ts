import { sameSide } from './battlePrimitives'
import { appliesInMode, cardsDue, cardsDueFromTheirTurn, type MissionAward } from './scoring'
import type { PlayerId, Secondary, Command, PlayerState, BattleState } from './battle'
import { BATTLE_ROUNDS } from './battlePhases'
import { commandArmy } from './battleSides'

/** How many tactical cards a side draws at the top of each of its own turns. Unresolved cards from earlier turns are kept alongside them, not replaced. */
const TACTICAL_HAND_SIZE = 2

export function holdsSecondary(player: PlayerState, key: string): boolean {
  return player.secondaries.some((secondary) => secondary.key === key)
}

/** What the active side still owes before the turn moves on, or null. */
export function sideOwes(state: BattleState, player: PlayerState): 'settlement' | 'cards' | null {
  if (state.phase === 'command' && state.pendingSettlement?.playerId === player.id) return 'settlement'
  if (
    state.phase === 'command' &&
    player.secondaryMode === 'tactical' &&
    player.secondariesDrawnThisTurn.length < secondaryDrawTarget(player) &&
    undrawnSecondaries(player).length
  ) {
    return 'cards'
  }
  return null
}

export function secondaryDrawTarget(player: PlayerState): number {
  return TACTICAL_HAND_SIZE + player.additionalSecondaryDrawsThisTurn
}

/** The cards still in a side's deck. */
export function undrawnSecondaries(player: Pick<PlayerState, 'secondaryDeck' | 'secondaries'>): Secondary[] {
  return (player.secondaryDeck ?? []).filter((candidate) => !player.secondaries.some((secondary) => secondary.key === candidate.key))
}

/**
 * Whether a random secondary draw worked out from `before` deals the same hand against `after`.
 *
 * The service picks a random draw's cards, so the commands appended since only change
 * the draw when they move the turn or this army's hand or deck. Anything else, such as
 * the opponent spending CP in the same Command Phase, leaves the draw as its player saw it.
 */
export function sameRandomDraw(before: BattleState, after: BattleState, by: PlayerId, command: Command): boolean {
  if (command.kind !== 'draw-secondaries' || command.selected) return false
  const facts = (state: BattleState) => {
    const player = commandArmy(state, by, command)
    return (
      player &&
      JSON.stringify([
        state.status,
        state.round,
        state.phase,
        state.activePlayerId,
        state.turnSeq,
        player.id,
        player.secondaryMode,
        player.secondaries.map((secondary) => [secondary.key, player.secondaryStatus[secondary.key]]),
        player.secondariesDrawnThisTurn,
        player.secondariesToReview,
        secondaryDrawTarget(player),
        player.secondaryDeck?.map((secondary) => secondary.key),
      ])
    )
  }
  const drawn = facts(before)
  return drawn !== undefined && drawn === facts(after)
}

/** The cards in hand still in play. */
export function activeTacticalSecondaries(player: PlayerState): Secondary[] {
  return player.secondaries.filter((secondary) => player.secondaryStatus[secondary.key] === 'active')
}

/** A secondary as scoring reads it: only the awards its side's way of playing pays. */
function dueSecondary(player: PlayerState, secondary: Secondary, awards: MissionAward[]) {
  return { ...secondary, category: 'secondary' as const, awards: awards.filter((award) => appliesInMode(award, player.secondaryMode)) }
}

function scoringCards(player: PlayerState) {
  const primary = player.primaryCard?.awards
    ? [{ ...player.primaryCard, category: 'primary' as const, awards: player.primaryCard.awards }]
    : []
  const secondaries = player.secondaries.flatMap((secondary) => {
    if (player.secondaryStatus[secondary.key] !== 'active' || !secondary.awards) return []
    return [dueSecondary(player, secondary, secondary.awards)]
  })
  return [...primary, ...secondaries]
}

export function scoringDue(state: BattleState, player: PlayerState) {
  return cardsDue(
    {
      phase: state.phase,
      round: state.round,
      rounds: BATTLE_ROUNDS,
      endOfBattle: atBattleEnd(state) && player.finalPrimary === 0,
    },
    true,
    scoringCards(player),
    [],
    player.secondaryMode,
  )
}

export function scoringDueFromTheirTurn(state: BattleState, player: PlayerState, round: number) {
  return cardsDueFromTheirTurn(
    round,
    BATTLE_ROUNDS,
    scoringCards(player),
    activeTacticalSecondaries(player).map(({ key }) => key),
    atBattleEnd(state) && player.finalPrimary === 0,
    player.secondaryMode,
  )
}

export function atBattleEnd(state: BattleState): boolean {
  return (
    state.status === 'playing' &&
    state.phase === 'end' &&
    state.round === BATTLE_ROUNDS &&
    (state.completionPending ||
      (state.pendingSettlement === null &&
        state.activePlayerId !== null &&
        !sameSide(state, state.activePlayerId, state.firstPlayerId ?? '')))
  )
}
