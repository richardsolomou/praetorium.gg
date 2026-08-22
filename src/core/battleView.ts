import {
  BATTLE_ROUNDS,
  type BattleEndReason,
  type BattleSettings,
  type BattleState,
  battleRoundLimit,
  helperAdvancePending,
  PAINTED_ARMY_POINTS,
  type PlayerId,
  PRIMARY_GUIDE,
  type Roster,
  SECONDARY_GUIDE,
  sameSide,
  type Secondary,
  type SecondaryMode,
  type SecondaryStatus,
  type Phase,
  sideCaptain,
  type StratagemLimit,
  type UnitState,
  validate,
} from './battle'

/**
 * The only place visibility is decided.
 *
 * Every route and every server function reads a battle through here, so a new field
 * cannot leak by being added to a shape someone else assembled by hand. Kept apart
 * from `battle.ts` for that reason: what a player may see is one question with one
 * answer, and it is easier to hold to when it has a file of its own.
 *
 * Drawn cards, lists and points are public to both players. Undrawn tactical cards
 * and unrevealed secret missions are held back for their owner here.
 */

export type BattleView = {
  token: string
  status: BattleState['status']
  setupStep: number
  round: number
  phase: Phase
  rounds: number
  /** What a command must carry to be accepted. Anything older is a stale client. */
  seq: number
  viewerId: PlayerId
  creatorId: PlayerId
  activePlayerId: PlayerId | null
  attackerId: PlayerId | null
  settlementRound: number | null
  settings: BattleSettings
  result: { reason: BattleEndReason; concededBy: PlayerId | null } | null
  players: {
    id: PlayerId
    side: number
    name: string
    image: string | null
    isViewer: boolean
    isActive: boolean
    cp: number
    cpGained: number
    cpSpent: number
    cpByRound: number[]
    primary: number
    secondary: number
    total: number
    painted: boolean
    paintedPoints: number
    rounds: { round: number; primary: number; secondary: number; total: number }[]
    roster: Roster | null
    units: UnitState[]
    /** What is still on the table, for the line a player actually glances at. */
    standing: number
    deployed: number
    /** Each stratagem with whether it can be used right now, and why not when it cannot. */
    stratagems: {
      key: string
      name: string
      cp: number
      limit: StratagemLimit
      phases?: Phase[]
      turn?: 'your-turn' | 'opponent-turn' | 'either'
      uses: number
      refusal: string | null
    }[]
    secondaries: {
      key: string
      name: string
      points: number
      rounds: number[]
      status: SecondaryStatus
      secret: boolean
      revealed: boolean
    }[]
    primaryCard: Secondary | null
    secondaryMode: SecondaryMode
    remainingSecondaries: Secondary[]
  }[]
  /** The conventional ceilings, for display beside a total. */
  guides: { primary: number; secondary: number }
  deploymentId: string | null
  turns: { playerId: PlayerId; playerName: string; round: number; minutes: number | null }[]
  advancePrompt: string | null
  /** The latest active command any seated player may take back. */
  undoable: number | null
  /** Whether taking back that command returns a randomly drawn mission to its deck. */
  undoableDraw: boolean
}

/**
 * The only place visibility is decided. Every route and every server function
 * reads a battle through here, so a new field cannot leak by being added to a
 * shape someone else assembled by hand.
 *
 * Drawn cards, lists, and points are public to both players. Undrawn tactical
 * cards and unrevealed secret missions are held back for their owner here.
 */
export function battleView(
  battle: { token: string },
  players: readonly { id: PlayerId; name: string; image?: string | null }[],
  state: BattleState,
  viewerId: PlayerId,
  _now = Date.now(),
): BattleView {
  const named = new Map(players.map((player) => [player.id, player.name]))
  const active = state.players.find((player) => player.id === state.activePlayerId)
  const viewerOwnsActive = active ? sideCaptain(state, active.side).id === viewerId : false
  return {
    token: battle.token,
    status: state.status,
    setupStep: state.setupStep,
    round: state.round,
    phase: state.phase,
    rounds: battleRoundLimit(state.settings.limit),
    seq: state.seq,
    viewerId,
    creatorId: players[0]?.id ?? viewerId,
    activePlayerId: state.activePlayerId,
    attackerId: state.attackerId,
    settlementRound: state.pendingSettlement?.playerId === viewerId ? state.pendingSettlement.round : null,
    settings: state.settings,
    result: state.result,
    players: state.players.map((player) => {
      const resources = sideCaptain(state, player.side)
      return {
        id: player.id,
        side: player.side,
        name: named.get(player.id) ?? 'Unknown',
        image: players.find((identity) => identity.id === player.id)?.image ?? null,
        isViewer: player.id === viewerId,
        isActive: sameSide(state, state.activePlayerId, player.id),
        cp: resources.cp,
        cpGained: resources.cpGained,
        cpSpent: resources.cpSpent,
        cpByRound: resources.cpByRound,
        primary: resources.primary,
        secondary: resources.secondary,
        total: resources.primary + resources.secondary + (state.status === 'finished' && player.painted ? PAINTED_ARMY_POINTS : 0),
        painted: player.painted,
        /** What the bonus will pay. It joins the total when the battle ends, not before. */
        paintedPoints: player.painted ? PAINTED_ARMY_POINTS : 0,
        rounds: Array.from({ length: battleRoundLimit(state.settings.limit) }, (_, round) => ({
          round: round + 1,
          primary: resources.primaryByRound[round] ?? 0,
          secondary: resources.secondaryByRound[round] ?? 0,
          total: (resources.primaryByRound[round] ?? 0) + (resources.secondaryByRound[round] ?? 0),
        })),
        roster: player.roster,
        units: player.units,
        standing: player.units.filter((unit) => !unit.destroyed).length,
        deployed: player.units.filter((unit) => unit.deployed && !unit.destroyed).length,
        stratagems: resources.stratagems.map((stratagem) => ({
          ...stratagem,
          uses: resources.uses.filter((use) => use.key === stratagem.key).length,
          // The same rule the server enforces, so the interface never offers what
          // would be refused.
          refusal: validate(state, player.id, { kind: 'use-stratagem', key: stratagem.key }),
        })),
        primaryCard: resources.primaryCard,
        secondaryMode: resources.secondaryMode,
        remainingSecondaries:
          resources.id === viewerId
            ? (resources.secondaryDeck ?? []).filter(
                (candidate) => !resources.secondaries.some((secondary) => secondary.key === candidate.key),
              )
            : [],
        secondaries: resources.secondaries.map((secondary) => ({
          key:
            resources.secretSecondary === secondary.key &&
            !resources.secretRevealed &&
            player.side !== state.players.find((candidate) => candidate.id === viewerId)?.side
              ? 'secret'
              : secondary.key,
          name:
            resources.secretSecondary === secondary.key &&
            !resources.secretRevealed &&
            player.side !== state.players.find((candidate) => candidate.id === viewerId)?.side
              ? 'Secret mission'
              : secondary.name,
          points: resources.scored[secondary.key] ?? 0,
          rounds: (resources.scoredByRound[secondary.key] ?? Array(BATTLE_ROUNDS).fill(0)).slice(0, battleRoundLimit(state.settings.limit)),
          status: resources.secondaryStatus[secondary.key] ?? 'active',
          secret: resources.secretSecondary === secondary.key,
          revealed: resources.secretSecondary !== secondary.key || resources.secretRevealed,
        })),
      }
    }),
    guides: { primary: PRIMARY_GUIDE, secondary: SECONDARY_GUIDE },
    deploymentId: state.deploymentId,
    turns: state.turns.map((turn) => ({
      playerId: turn.playerId,
      playerName: named.get(turn.playerId) ?? 'Unknown',
      round: turn.round,
      minutes: turn.endedAt === null ? null : Math.max(0, Math.round((turn.endedAt - turn.startedAt) / 60_000)),
    })),
    advancePrompt: viewerOwnsActive ? scoringPrompt(state, viewerId) : helperAdvancePrompt(state, viewerId),
    undoable: state.undoable?.seq ?? null,
    undoableDraw: state.undoable?.kind === 'draw-secondary',
  }
}

function scoringPrompt(state: BattleState, playerId: PlayerId): string | null {
  const viewer = state.players.find((player) => player.id === playerId)
  const active = viewer ? sideCaptain(state, viewer.side) : undefined
  if (!active || state.phase !== 'end') return null
  const unscored = active.secondaries.filter(
    (secondary) =>
      active.secondaryStatus[secondary.key] === 'active' && (active.scoredByRound[secondary.key]?.[state.round - 1] ?? 0) === 0,
  )
  return unscored.length ? `Check ${unscored.map((secondary) => secondary.name).join(' and ')} before passing the turn.` : null
}

function helperAdvancePrompt(state: BattleState, viewerId: PlayerId): string | null {
  const active = state.activePlayerId ? state.players.find((player) => player.id === state.activePlayerId) : undefined
  const player = active ? sideCaptain(state, active.side) : undefined
  return player && helperAdvancePending(state, viewerId, player) ? 'The active side has an action to settle.' : null
}
