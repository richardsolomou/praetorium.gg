import {
  BATTLE_ROUNDS,
  type BattleEndReason,
  type BattleSettings,
  type BattleState,
  battleRoundLimit,
  mayNameCard,
  sideDisposition,
  sideDispositionChoices,
  sidePaintedPoints,
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
  sideOwes,
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
  /** Who takes the first turn, from the roll-off recorded before the battle begins. */
  firstPlayerId: PlayerId | null
  settlementRound: number | null
  /** The side captain whose previous-turn scoring is being settled, visible to every seat. */
  settlementPlayerId: PlayerId | null
  settings: BattleSettings
  result: { reason: BattleEndReason; concededBy: PlayerId | null } | null
  players: {
    id: PlayerId
    side: number
    name: string
    image: string | null
    isViewer: boolean
    /** A seat nobody signs in to, so the players facing it are the ones who play it. */
    automated: boolean
    isActive: boolean
    /**
     * The Force Disposition this player's side plays, which is the side's rather than
     * this list's: an allied pair fields one army between them and plays one card.
     * Null where two allies brought different cards and have not settled which.
     */
    disposition: string | null
    /** The cards the side could play, where its allies brought more than one. */
    dispositionChoices: string[]
    cp: number
    cpGained: number
    cpSpent: number
    cpByRound: number[]
    canGainCp: boolean
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
      /** The detachment that prints it, where the pool recorded one. */
      detachment?: string
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
    /**
     * The cards this side's turn has dealt, out of `TACTICAL_HAND_SIZE`.
     *
     * Named, so the prompt can tell what a turn just dealt from what a hand has been
     * carrying — only the first may be put back. Masked exactly like the hand itself,
     * so a side reading across the table counts the draws without learning the cards.
     */
    secondariesDrawnThisTurn: string[]
  }[]
  /** The conventional ceilings, for display beside a total. */
  guides: { primary: number; secondary: number }
  deploymentId: string | null
  leagueToken: string | null
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
  players: readonly { id: PlayerId; name: string; image?: string | null; automated?: boolean }[],
  state: BattleState,
  viewerId: PlayerId,
  _now = Date.now(),
): BattleView {
  const named = new Map(players.map((player) => [player.id, player.name]))
  const automated = new Set(players.filter((player) => player.automated).map((player) => player.id))
  /**
   * Whether the viewer is one of the people playing a side.
   *
   * Their own side, or a side with nobody signed in to it: a practice opponent
   * never opens the app, so its cards are held by whoever is sitting across from
   * it. Without this its hand would be hidden from the only person able to play it.
   */
  const plays = (side: number) => {
    const seated = state.players.filter((player) => player.side === side)
    return seated.some((player) => player.id === viewerId) || seated.every((player) => automated.has(player.id))
  }
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
    firstPlayerId: state.firstPlayerId,
    settlementRound: state.pendingSettlement?.round ?? null,
    settlementPlayerId: state.pendingSettlement?.playerId ?? null,
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
        automated: automated.has(player.id),
        isActive: sameSide(state, state.activePlayerId, player.id),
        /**
         * The Force Disposition this player's side plays, which is the side's rather
         * than this list's: an allied pair fields one army and plays one card.
         */
        disposition: sideDisposition(state, player.side),
        /** The cards the side could play, where its allies brought different ones. */
        dispositionChoices: sideDispositionChoices(state, player.side),
        cp: resources.cp,
        cpGained: resources.cpGained,
        cpSpent: resources.cpSpent,
        cpByRound: resources.cpByRound,
        canGainCp: (resources.bonusCpByRound[state.round - 1] ?? 0) < 1,
        primary: resources.primary,
        secondary: resources.secondary,
        total: resources.primary + resources.secondary + (state.status === 'finished' ? sidePaintedPoints(state, player.side) : 0),
        painted: player.painted,
        /**
         * What the bonus will pay this player's side. It joins the total when the battle
         * ends, not before, and it is the side's rather than the seat's — so every seat
         * on a side reads the same number, the way they read the same command points.
         */
        paintedPoints: sidePaintedPoints(state, player.side),
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
        secondariesDrawnThisTurn: resources.secondariesDrawnThisTurn.map((key) =>
          mayNameCard(state, viewerId, resources, key) ? key : 'secret',
        ),
        /**
         * What is left in this side's deck, to the people playing that side.
         *
         * An ally sees it too: the pair share one hand, and reading it only from
         * the seat the domain folds resources onto left the other unable to draw.
         * It stays off an opponent's screen because the deck minus what is held
         * would name a card played face down.
         */
        remainingSecondaries: plays(player.side)
          ? (resources.secondaryDeck ?? []).filter(
              (candidate) => !resources.secondaries.some((secondary) => secondary.key === candidate.key),
            )
          : [],
        secondaries: resources.secondaries.map((secondary) => {
          // The one thing in the game that is genuinely hidden, masked in one place.
          const nameable = mayNameCard(state, viewerId, resources, secondary.key)
          return {
            key: nameable ? secondary.key : 'secret',
            name: nameable ? secondary.name : 'Secret mission',
            points: resources.scored[secondary.key] ?? 0,
            rounds: (resources.scoredByRound[secondary.key] ?? Array(BATTLE_ROUNDS).fill(0)).slice(
              0,
              battleRoundLimit(state.settings.limit),
            ),
            status: resources.secondaryStatus[secondary.key] ?? 'active',
            secret: resources.secretSecondary === secondary.key,
            revealed: resources.secretSecondary !== secondary.key || resources.secretRevealed,
          }
        }),
      }
    }),
    guides: { primary: PRIMARY_GUIDE, secondary: SECONDARY_GUIDE },
    deploymentId: state.deploymentId,
    leagueToken: state.leagueToken,
    turns: state.turns.map((turn) => ({
      playerId: turn.playerId,
      playerName: named.get(turn.playerId) ?? 'Unknown',
      round: turn.round,
      minutes: turn.endedAt === null ? null : Math.max(0, Math.round((turn.endedAt - turn.startedAt) / 60_000)),
    })),
    advancePrompt: advancePrompt(state, viewerId),
    undoable: state.undoable?.seq ?? null,
    undoableDraw: state.undoable?.kind === 'draw-secondary' || state.undoable?.kind === 'draw-secondaries',
  }
}

/**
 * What the active side still has to do before the turn moves on.
 *
 * One sentence, the same on every device. Any seat may draw, discard, score or
 * settle for either side, so this reads as what is outstanding rather than as a
 * rule about whose turn it is to press something. Only the naming is the
 * viewer's: a card held face down is named to its own side and called a secret
 * mission to the other.
 */
function advancePrompt(state: BattleState, viewerId: PlayerId): string | null {
  const active = state.activePlayerId ? state.players.find((player) => player.id === state.activePlayerId) : undefined
  const player = active ? sideCaptain(state, active.side) : undefined
  if (!player) return null
  const owed = sideOwes(state, player)
  if (owed === 'settlement') return 'The previous turn is still to be settled.'
  if (owed === 'cards') return 'The active side has secondary missions to draw.'
  if (owed === 'secret') return 'The active side has a secret mission to reveal or discard.'
  if (state.phase !== 'end') return null
  const unscored = player.secondaries.filter(
    (secondary) =>
      player.secondaryStatus[secondary.key] === 'active' && (player.scoredByRound[secondary.key]?.[state.round - 1] ?? 0) === 0,
  )
  if (!unscored.length) return null
  const names = unscored.map((secondary) => (mayNameCard(state, viewerId, player, secondary.key) ? secondary.name : 'a secret mission'))
  return `Check ${names.join(' and ')} before passing the turn.`
}
