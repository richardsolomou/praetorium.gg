import { opposingSide, sameSide, playsSide } from './battlePrimitives'
import {
  BATTLE_ROUNDS,
  type BattleEndReason,
  type BattleSettings,
  type BattleState,
  mayNameCard,
  sideDisposition,
  sideDispositionChoices,
  sideWarlord,
  sideWarlordChoices,
  sidePaintedPoints,
  type PlayerId,
  PRIMARY_GUIDE,
  type Roster,
  SECONDARY_GUIDE,
  secondaryDrawTarget,
  type TurnScope,
  scoringDue,
  secretSettlementActionPlayerId,
  type Secondary,
  type SecondaryMode,
  type SecondaryStatus,
  type Phase,
  sideCaptain,
  sideOwes,
  type StratagemLimit,
  type UnitState,
  validate,
  atBattleEnd,
  type BattleMoment,
  missedMoments,
  type BuiltRoster,
  undrawnSecondaries,
} from './battle'
import { battleUnitCounts } from './attachedUnits'
import { withoutUnitNotes } from './unitNotes'
import {
  consecratedObjectives,
  openMissionSelections,
  missionUnitCandidates,
  remainingOperationMarkers,
  savedMissionUnitStatus,
  type MissionObjectiveRef,
  type MissionSelectionPrompt,
  type OperationMarker,
  type SavedMissionSelection,
  type SavedMissionUnit,
} from './missionSelections'

export type MissionSelectionView = Omit<SavedMissionSelection, 'units'> & {
  units: (SavedMissionUnit & { status: ReturnType<typeof savedMissionUnitStatus> })[]
}
export type MissionChoiceView = MissionSelectionPrompt & {
  playerId: string
  canChoose: boolean
  units: SavedMissionUnit[]
  markers?: OperationMarker[]
  consecrated?: MissionObjectiveRef[]
}

/**
 * The attached list as a screen reads it.
 *
 * The frozen units are deliberately absent: `units` on the same player carries
 * every submitted field plus the battle state, so `built.units` beside it would
 * send both armies twice in every read of every battle.
 */
export type RosterView = Omit<Roster, 'built' | 'reminders' | 'remindersEnabled'> & {
  built?: Omit<BuiltRoster, 'units'>
  reminders?: Roster['reminders']
  remindersEnabled?: boolean
}

export type BattleView = {
  token: string
  status: BattleState['status']
  setupStep: number
  round: number
  phase: Phase
  rounds: number
  endOfBattle: boolean
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
  advanceRequested: boolean
  scoringAcknowledged: boolean
  drawAcknowledged: boolean
  settings: BattleSettings
  result: { reason: BattleEndReason; concededBy: PlayerId | null } | null
  missionChoices?: MissionChoiceView[]
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
    /** The cards the side could still choose between, where its allies offered more than one and no league sealed its card. */
    dispositionChoices: string[]
    /** The player whose Warlord leads this player's side; null while allies have not chosen. */
    warlord: PlayerId | null
    /** The allies the side could still choose between, where each list names a Warlord and no league sealed the choice. */
    warlordChoices: PlayerId[]
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
    roster: RosterView | null
    units: UnitState[]
    /** What is still on the table, for the line a player actually glances at. */
    standing: number
    /** How many units the army plays after attachments are formed. */
    unitCount: number
    deployed: number
    /** Each stratagem with whether it can be used right now, and why not when it cannot. */
    stratagems: {
      key: string
      name: string
      cp: number
      limit: StratagemLimit
      phases?: Phase[]
      turn?: TurnScope
      /** The detachment that prints it, where the pool recorded one. */
      detachment?: string
      uses: number
      refusal: string | null
    }[]
    secondaries: {
      key: string
      name: string
      awards?: NonNullable<Secondary['awards']>
      points: number
      rounds: number[]
      status: SecondaryStatus
      secret: boolean
      revealed: boolean
    }[]
    primaryCard: Secondary | null
    missionSelections?: MissionSelectionView[]
    finalPrimary: number
    secondaryMode: SecondaryMode
    /** Whether this side has a secondary deck, without exposing the cards in it. */
    secondaryDeckReady: boolean
    remainingSecondaries: Secondary[]
    /**
     * The cards this side's turn has dealt, out of `TACTICAL_HAND_SIZE`.
     *
     * Named, so the prompt can tell what a turn just dealt from what a hand has been
     * carrying — only the first may be put back. Masked exactly like the hand itself,
     * so a side reading across the table counts the draws without learning the cards.
     */
    secondariesDrawnThisTurn: string[]
    secondaryDrawTarget: number
    secondariesToReview: string[]
  }[]
  /** The conventional ceilings, for display beside a total. */
  guides: { primary: number; secondary: number }
  deploymentId: string | null
  leagueToken: string | null
  leagueEventToken: string | null
  clubId: string | null
  advancePrompt: string | null
  secretMissionActionPlayerId: PlayerId | null
  /** The earlier moments a missed action may still be recorded for, oldest first; absent from older servers. */
  missedMoments?: BattleMoment[]
  /** The latest active command any seated player may take back. */
  undoable: number | null
  /** Whether taking back that command returns missions from this turn to the deck. */
  undoableDraw: boolean
}

/**
 * The only place visibility is decided.
 *
 * Every route and every server function reads a battle through here, so a new field
 * cannot leak by being added to a shape someone else assembled by hand. Kept apart
 * from `battle.ts` for that reason: what a player may see is one question with one
 * answer, and it is easier to hold to when it has a file of its own.
 *
 * Cards, lists and points are public to both players. Only an unrevealed Secret
 * Mission and the deck state that would identify it are held back here, along with
 * each player's personal reminders and unit notes.
 */

export function battleView(
  battle: { token: string },
  players: readonly { id: PlayerId; name: string; image?: string | null; automated?: boolean }[],
  state: BattleState,
  viewerId: PlayerId,
): BattleView {
  const named = new Map(players.map((player) => [player.id, player.name]))
  const automated = new Set(players.filter((player) => player.automated).map((player) => player.id))
  return {
    token: battle.token,
    status: state.status,
    setupStep: state.setupStep,
    round: state.round,
    phase: state.phase,
    rounds: BATTLE_ROUNDS,
    endOfBattle: atBattleEnd(state),
    seq: state.seq,
    viewerId,
    creatorId: players[0]?.id ?? viewerId,
    activePlayerId: state.activePlayerId,
    attackerId: state.attackerId,
    firstPlayerId: state.firstPlayerId,
    settlementRound: state.pendingSettlement?.round ?? null,
    settlementPlayerId: state.pendingSettlement?.playerId ?? null,
    advanceRequested: state.advanceRequested,
    scoringAcknowledged: state.scoringAcknowledged,
    drawAcknowledged: state.drawAcknowledged,
    settings: state.settings,
    result: state.result,
    missionChoices: state.pendingSettlement
      ? []
      : state.players
          .filter((player) => sideCaptain(state, player.side).id === player.id)
          .flatMap((player) =>
            openMissionSelections(state, player)
              .filter((prompt) => mayNameCard(state, viewerId, player, prompt.cardKey))
              .map((prompt) => ({
                ...prompt,
                playerId: player.id,
                canChoose: playsSide(state, viewerId, prompt.chooserSide),
                units: missionUnitCandidates(
                  state,
                  prompt.kind === 'punishment' ? (opposingSide(state, player.side) ?? -1) : player.side,
                  prompt.kind !== 'beacon',
                ),
                ...(prompt.kind === 'sensor-sweep' ? { markers: remainingOperationMarkers(state) } : {}),
                ...(prompt.kind === 'consecrate' ? { consecrated: consecratedObjectives(player, prompt.cardKey) } : {}),
              })),
          ),
    players: state.players.map((player) => {
      const resources = sideCaptain(state, player.side)
      const units = battleUnitCounts(player.units)
      return {
        id: player.id,
        side: player.side,
        name: named.get(player.id) ?? 'Unknown',
        image: players.find((identity) => identity.id === player.id)?.image ?? null,
        isViewer: player.id === viewerId,
        automated: automated.has(player.id),
        isActive: sameSide(state, state.activePlayerId, player.id),
        disposition: sideDisposition(state, player.side),
        dispositionChoices: state.dispositionsSealed ? [] : sideDispositionChoices(state, player.side),
        warlord: sideWarlord(state, player.side),
        warlordChoices: state.warlordsSealed ? [] : sideWarlordChoices(state, player.side),
        cp: resources.cp,
        cpGained: resources.cpGained,
        cpSpent: resources.cpSpent,
        cpByRound: resources.cpByRound,
        canGainCp: state.settings.manual === true || (resources.bonusCpByRound[state.round - 1] ?? 0) < 1,
        primary: resources.primary,
        secondary: resources.secondary,
        total: resources.primary + resources.secondary + (state.status === 'setup' ? 0 : sidePaintedPoints(state, player.side)),
        painted: player.painted,
        /**
         * What the bonus pays this player's side. It joins the total when the battle
         * begins, and it is the side's rather than the seat's — so every seat on a side
         * reads the same number, the way they read the same command points.
         */
        paintedPoints: sidePaintedPoints(state, player.side),
        rounds: Array.from({ length: BATTLE_ROUNDS }, (_, round) => ({
          round: round + 1,
          primary: resources.primaryByRound[round] ?? 0,
          secondary: resources.secondaryByRound[round] ?? 0,
          total: (resources.primaryByRound[round] ?? 0) + (resources.secondaryByRound[round] ?? 0),
        })),
        roster: viewRoster(player.roster, player.units, player.id === viewerId),
        units: player.id === viewerId ? player.units : withoutUnitNotes(player.units),
        unitCount: units.total,
        standing: units.standing,
        deployed: units.deployed,
        stratagems: resources.stratagems.map((stratagem) => ({
          ...stratagem,
          uses: resources.uses.filter((use) => use.key === stratagem.key).length,
          // The same rule the server enforces, so the interface never offers what
          // would be refused.
          refusal: validate(state, player.id, { kind: 'use-stratagem', key: stratagem.key }),
        })),
        primaryCard: resources.primaryCard,
        missionSelections: resources.missionSelections
          .filter((saved) => mayNameCard(state, viewerId, resources, saved.cardKey))
          .map((saved) => ({
            ...saved,
            units: saved.units.map((unit) => ({ ...unit, status: savedMissionUnitStatus(state, unit) })),
          })),
        finalPrimary: resources.finalPrimary,
        secondaryMode: resources.secondaryMode,
        secondaryDeckReady: Boolean(resources.secondaryDeck?.length),
        secondariesDrawnThisTurn: resources.secondariesDrawnThisTurn.map((key) =>
          mayNameCard(state, viewerId, resources, key) ? key : 'secret',
        ),
        secondaryDrawTarget: secondaryDrawTarget(resources),
        secondariesToReview: resources.secondariesToReview.map((key) => (mayNameCard(state, viewerId, resources, key) ? key : 'secret')),
        /**
         * A face-down card is identifiable from what disappeared from its public deck.
         */
        remainingSecondaries:
          !resources.secretSecondary || resources.secretRevealed || playsSide(state, viewerId, player.side)
            ? undrawnSecondaries(resources)
            : [],
        secondaries: resources.secondaries.map((secondary) => {
          // The one thing in the game that is genuinely hidden, masked in one place.
          const nameable = mayNameCard(state, viewerId, resources, secondary.key)
          return {
            key: nameable ? secondary.key : 'secret',
            name: nameable ? secondary.name : 'Secret mission',
            awards: nameable ? secondary.awards : undefined,
            points: resources.scored[secondary.key] ?? 0,
            rounds: (resources.scoredByRound[secondary.key] ?? Array(BATTLE_ROUNDS).fill(0)).slice(0, BATTLE_ROUNDS),
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
    leagueEventToken: state.leagueEventToken,
    clubId: state.clubId,
    advancePrompt: advancePrompt(state, viewerId),
    secretMissionActionPlayerId: secretMissionActionPlayerId(state),
    missedMoments: state.settings.manual ? [] : missedMoments(state),
    undoable: state.undoable?.seq ?? null,
    undoableDraw:
      state.undoable?.kind === 'draw-secondary' || state.undoable?.kind === 'draw-secondaries' || state.undoable?.kind === 'use-new-orders',
  }
}

/** The roster without its frozen units, which travel once as the player's `units`. */
function viewRoster(roster: Roster | null, units: readonly UnitState[], own: boolean): RosterView | null {
  if (!roster) return null
  const { reminders, remindersEnabled, ...visible } = roster
  const privateFields = own
    ? {
        reminders: reminders?.filter((reminder) => {
          if (!reminder.unit) return true
          const unit = units[reminder.unit.index]
          return unit !== undefined && (!unit.destroyed || reminder.whileDestroyed === true)
        }),
        remindersEnabled,
      }
    : {}
  if (!roster.built) return { ...visible, ...privateFields }
  const { units: _frozen, picks, ...built } = roster.built
  return { ...visible, ...privateFields, built: { ...built, ...(picks ? { picks: own ? picks : withoutUnitNotes(picks) } : {}) } }
}

function secretMissionActionPlayerId(state: BattleState): PlayerId | null {
  if (state.pendingSettlement) return secretSettlementActionPlayerId(state)
  const active = state.activePlayerId ? state.players.find((player) => player.id === state.activePlayerId) : undefined
  const player = active ? sideCaptain(state, active.side) : undefined
  if (!player?.secretSecondary || player.secretRevealed) return null
  return sideOwes(state, player) === 'secret' || scoringDue(state, player).some((card) => card.key === player.secretSecondary)
    ? player.id
    : null
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
