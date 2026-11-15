/**
 * The whole domain: what a battle is, what may happen to it, and who may see what.
 *
 * State is never stored. It is folded from an append-only command log, so the
 * server and both clients derive the same numbers from the same history, and
 * "who may do this" has exactly one implementation — `validate` — used by the
 * server to accept a command and by the UI to decide what to offer.
 *
 * No IO and no framework imports belong in this file.
 */

import { attachedUnits } from './attachedUnits'
import { refuse, sameSide, sidePlayers } from './battlePrimitives'
import { isGuestSeat, isPracticeSeat } from './newBattle'
import { finalAwardTotal, type MissionAward } from './scoring'
import type { UnitGroup } from './unitGroups'
import type { RosterPick } from './roster'
import type { RosterReminder } from './reminders'
import { correctStratagemTiming } from './stratagemCorrections'
import type { PrintedTransport } from './transport'
import type { CatalogueEdition } from './catalogueEdition'
import type { MissionSelection, MissionSelectionKind } from './missionSelections'
import { applyMissionSelection, missionSelectionRefusal, recordBeaconDestruction, type SavedMissionSelection } from './missionSelections'
import { PHASES, type Phase, type TurnScope, BATTLE_ROUNDS } from './battlePhases'
import { PLAYERS_PER_BATTLE, battleCapacity } from './battleSeats'
import {
  DETACHMENTS_MAX,
  isGameSize,
  isKotcLimit,
  validArmyPoints,
  ARMY_POINTS_ERROR,
  type FormatRuleId,
  detachmentPointsError,
  fitsBattleSize,
  teamArmyProblems,
  rosterBattleFormat,
  pointsBudgetsAgree,
} from './battleFormat'
import {
  type UnitFormation,
  embarkedCapacityError,
  unitFormationRefusal,
  redeploysToReserves,
  movedReserveError,
  strategicReserveSideError,
  changedFormation,
  fieldedUnits,
  startingEmbarks,
  disembarkPassengers,
  unitWoundsLeft,
  casualtyOutcome,
} from './battleUnits'
import {
  sideDisposition,
  sideDispositionChoices,
  sideWarlord,
  sideWarlordChoices,
  sideCaptain,
  namesAnotherArmy,
  commandTarget,
  targetArmy,
} from './battleSides'
import {
  holdsSecondary,
  sideOwes,
  secondaryDrawTarget,
  undrawnSecondaries,
  activeTacticalSecondaries,
  scoringDue,
  atBattleEnd,
} from './battleSecondaries'
import { playedMoment, momentOrder, missedMomentRefusal, missedScoreRefusal } from './battleMoments'

export { PHASES, type Phase, TURN_SCOPES, type TurnScope, BATTLE_ROUNDS } from './battlePhases'
export { battleCapacity, openPlaces, stillFilling } from './battleSeats'
export {
  DETACHMENTS_MAX,
  DEFAULT_GAME_LIMIT,
  GAME_SIZES,
  isGameSize,
  detachmentPointBudget,
  isKotcLimit,
  POINTS_BUDGET_MIN,
  POINTS_BUDGET_MAX,
  validArmyPoints,
  ARMY_POINTS_ERROR,
  allowsPointsBudget,
  pointsBudgetError,
  customPointsBudget,
  pointsBudgetOf,
  pointsLabel,
  pointsSize,
  battleSizeName,
  battleSizeTitle,
  battleSizeOptionLabel,
  battleSizeLabel,
  FORMAT_RULE_IDS,
  type FormatRuleId,
  type FormatRule,
  enforces,
  detachmentLimit,
  formatDatasheetLimit,
  kotcDatasheetRepeatable,
  formatRules,
  waivedFormatRules,
  kotcUnitExclusions,
  BORROWED_DISPOSITION_BUDGET,
  OPTIONAL_RULE_IDS,
  type OptionalRuleId,
  type OptionalRule,
  plays,
  optionalRules,
  pickedOptionalRules,
  borrowedDispositionError,
  detachmentPointsError,
  fitsBattleSize,
  evenArmyPoints,
  armyPointsFor,
  pointsSpent,
  withinArmyPoints,
  withinSharedArmyPoints,
  sharedSidePoints,
  teamArmyProblems,
  sidePoints,
  shortSides,
  rosterBattleFormat,
  pointsBudgetsAgree,
  battlePointsBudget,
  armyPointsText,
  battleSizeText,
} from './battleFormat'
export {
  UNIT_FORMATIONS,
  type UnitFormation,
  strategicReserveLimit,
  strategicReservePoints,
  transportLabel,
  transportLoadOf,
  transportAboard,
  canTransport,
  strategicReserveSideTotals,
  unitFormationRefusal,
  fieldedUnits,
  startingEmbarks,
  startingEmbarkRefusal,
  casualtyOutcome,
} from './battleUnits'
export {
  sideDisposition,
  sideDispositionChoices,
  sideWarlord,
  sideWarlordChoices,
  sideCaptain,
  commandTarget,
  commandArmy,
  scoringTarget,
} from './battleSides'
export { sideOwes, secondaryDrawTarget, undrawnSecondaries, sameRandomDraw, scoringDue, atBattleEnd } from './battleSecondaries'
export { missedMoments } from './battleMoments'

const COMMAND_PHASE_CP = 1

export const ROSTER_NAME_MAX_LENGTH = 80

/**
 * The longest label naming where a stratagem came from.
 *
 * An army fielding several detachments names them together, so this is what those
 * names join to. Bounded at one name it would refuse the pool outright, and a
 * refused pool is a side playing with no stratagems at all.
 */
export const STRATAGEM_SOURCE_MAX_LENGTH = DETACHMENTS_MAX * (ROSTER_NAME_MAX_LENGTH + 3)
export const ROSTER_MAX_LENGTH = 20_000

export type PlayerId = string

/**
 * What a player is fielding.
 *
 * `text` is the submitted artefact and is always present — it is what an opponent
 * reads, and it works whether the list was pasted or built. `built` is added when
 * it came from catalogue data, and carries the revision it was validated against
 * so both players can be shown the same legality. Nothing derived is stored here:
 * the points follow from the selections and the revision, and are worked out on
 * read.
 */
export type Roster = {
  name: string
  text: string
  /** The saved list this came from, when it came from one. */ id?: string
  /** The friend who lent the saved list, named as they were when it was fielded. */
  lentBy?: { id: string; name: string }
  /** Player-authored prompts frozen with the army, hidden from the other side. */
  reminders?: RosterReminder[]
  remindersEnabled?: boolean
  built?: BuiltRoster
}

/**
 * What the catalogue said about the list at the moment it was attached.
 *
 * The expansion the price came from is deliberately not here. Nothing reads it —
 * the fold keeps `units`, the opponent reads `text`, and `id` points back at the
 * saved list — and carrying it would make every read of every log parse a
 * selection tree on behalf of no one.
 */
export type BuiltRoster = {
  catalogueId: string
  edition?: Pick<CatalogueEdition, 'id' | 'name' | 'status'>
  /** The catalogue revision this list was priced and validated against. */
  revision: string
  /** The battle size the list was built to, which sets every size-dependent limit. */
  limit: number
  /** A custom points budget the list was priced against; absent means the battle size's own total. */
  pointsBudget?: number
  /** Frozen when reserve-limit facts are known; absent from older snapshots. */
  strategicReserveLimit?: number
  /** Named for display, since an opponent's device may have no catalogue loaded. */
  detachment: string | null
  /** Ordered detachment purchases. */
  detachments?: { name: string; points: number | null }[]
  /** The 11th-edition detachment-point allowance for this battle size. */
  detachmentPointBudget?: number | null
  /** The chosen force disposition; the pair decides the mission. */
  disposition: string | null
  /** Every Force Disposition the list's detachments offered, which a side of allies chooses its one card from; absent from older snapshots. */
  dispositions?: string[]
  /** Frozen selections let a battle roster open the same applied datasheets as a shared roster. */
  detachmentIds?: string[]
  /** The format restrictions the list was built without, so it prices in the battle as it did in the builder. */
  waivedRules?: FormatRuleId[]
  picks?: RosterPick[]
  /**
   * The units as submitted, fixed at the moment the list was attached.
   *
   * This is the one place a derived thing is kept, and deliberately: the command
   * log points at these keys when a unit is marked destroyed, so they cannot be
   * re-derived later without the log meaning something different. It also lets an
   * opponent read the list on an instance that has no catalogue loaded.
   */
  units: SubmittedUnit[]
}

export const builtDetachments = (built: Pick<BuiltRoster, 'detachment' | 'detachments'> | undefined) =>
  built?.detachments ?? (built?.detachment ? [{ name: built.detachment, points: null }] : [])

export type SubmittedUnit = {
  key: string
  name: string
  /** Frozen from the saved pick; the note reaches only its owner's view. */
  nickname?: string
  note?: string
  points: number
  models: number
  /**
   * What one model of this unit can take, frozen with the rest of the list.
   *
   * Absent for two reasons, and the difference does not matter to anything reading
   * it: a log written before this was recorded, or a datasheet whose models do not
   * all have the same wounds. A squad of a sergeant and his veterans has no single
   * answer, and a unit is one row here, so the honest reply is to say nothing and
   * let the models be counted instead of naming a number that is wrong for most of
   * them.
   */
  wounds?: number
  /** Frozen roster-card details, absent from battle logs created before snapshots had a full roster view. */
  entryId?: string
  group?: UnitGroup
  warlord?: boolean
  warlordEligible?: boolean
  wargear?: { name: string; count: number }[]
  enhancements?: string[]
  upgrades?: string[]
  joined?: { label: string; name: string }[]
  /**
   * The unit this character joined, by key.
   *
   * `joined` says the same thing in words for a player to read, and two squads of
   * Plague Marines are two units with one name — so the key is what a screen groups
   * an attached unit by. Absent from logs written before it was recorded, which read
   * as an army of units standing alone.
   */
  attachedTo?: string
  formationOptions?: UnitFormation[]
  prebattleRules?: ('infiltrators' | 'scouts')[]
  /** A selected rule says this unit's points do not count towards the starting reserve limit. */
  strategicReserveExempt?: boolean
  /** Whether the frozen datasheet can carry other units. */
  transport?: boolean
  /** The transport's printed rule, frozen with the roster: its text in older logs, a token for it in newer ones. */
  transportRule?: string
  /** What the printed rule states, frozen with the roster since its text is published only as a token; absent from older logs. */
  transportCapacity?: PrintedTransport
  /** The datasheet's keywords, which a transport's rule names to say who may ride; absent from older logs. */
  keywords?: string[]
  /** The transport the list starts this unit in, by key; setup judges it again through `startingEmbarks`. */
  startsEmbarkedIn?: string
  /** While joined to a unit, this one can embark within any transport that unit can. */
  embarksWithBodyguard?: boolean
  /** The space each model takes in a transport it rides by `embarksWithBodyguard`, when its ability fixes one. */
  embarkedSpace?: number
}

/** A unit's standing in the battle. Attached rosters begin on the battlefield. */
export type UnitState = SubmittedUnit & {
  destroyed: boolean
  deployed: boolean
  formation: UnitFormation
  /** The key of this unit's transport when embarked. */
  embarkedIn?: string
  /** Why setup could not start this unit where its list said, until the table moves it. */
  startingEmbarkRefused?: string
  /** Whether the unit was on the battlefield when the first-turn roll was recorded. */
  deployedAtRollOff?: boolean
  /** The unit entered reserves after deployment, when the mission rules exempt it from the starting cap. */
  postDeploymentReserve?: boolean
  /**
   * Models still standing in the unit. A unit is destroyed when this reaches zero,
   * so losing the last model and losing the unit are the same event rather than two
   * things that can disagree.
   */
  alive: number
  /**
   * Wounds already suffered by the model currently taking them, below `wounds`.
   *
   * Damage lands on one model at a time, so this is the front model's alone and the
   * ones behind it are whole. Always zero for a unit whose wounds the log does not
   * know: there is nothing for a wound to be counted against.
   */
  damage: number
}

/**
 * A stratagem from the verified rules sources, with the cost, timing and usage limit
 * needed to validate its use during a battle.
 */
export type Stratagem = {
  key: string
  name: string
  cp: number
  limit: StratagemLimit
  phases?: Phase[]
  turn?: TurnScope
  /**
   * The detachment that prints it, where one does. Recorded because a side of allies
   * pools two detachments and their rules do not pool with them — each ally's
   * detachment affects their own army and the enemy, never their ally's — so the
   * pool has to be able to say which of them a card came from. Absent on a core
   * stratagem, and on every pool written before this was recorded.
   */
  detachment?: string
}

/** How often a stratagem may be used. Every limit except `battle` resets at its named boundary. */
export const STRATAGEM_LIMITS = ['phase', 'turn', 'battle-round', 'battle', 'unlimited'] as const
export type StratagemLimit = (typeof STRATAGEM_LIMITS)[number]

/**
 * The last section of setup, which is what a `set-setup-step` or `set-setup-checked` may name.
 *
 * The sections themselves are the interface's, not the domain's — this only bounds
 * the number so a command cannot point at nothing.
 */
export const SETUP_STEP_MAX = 9

/**
 * How many stratagems one side may hold.
 *
 * A side's pool is every detachment its armies field plus the core cards, so a 2v1
 * pools two armies rather than one and the ceiling has to hold both.
 */
export const STRATAGEMS_MAX = 48
export const STRATAGEM_CP_MAX = 6

/** A secondary mission, named by the player because the deck is not in the data either. */
export type Secondary = { key: string; name: string; awards?: MissionAward[]; selection?: MissionSelectionKind }

/** A card as a `set-prep` command carries it, without whatever else its reference holds. */
export const asSecondary = ({ key, name, awards }: Pick<Secondary, 'key' | 'name' | 'awards'>): Secondary => ({ key, name, awards })
export type SecondaryStatus = 'active' | 'achieved' | 'discarded' | 'returned'

/**
 * How many secondaries a side playing fixed takes.
 *
 * The mission pack says two, in the prose of its own setup sequence: "If using Fixed
 * Missions, they also note down which two Fixed Missions they will use." At most,
 * not exactly, because a player picking them sends each choice as it is made.
 *
 * This is the rule, so `validate` is where it is held. It is deliberately not the
 * schema's bound: a log written when this app allowed six still has six in it, and
 * a rule that tightened would make those battles unreadable rather than illegal.
 */
export const FIXED_SECONDARIES = 2

/**
 * How many a stored `set-prep` may carry, which is not the same question.
 *
 * The command schema is the storage contract as well as the wire one, so it has to
 * keep reading whatever was written. Loosening the rule is a rule change; loosening
 * this is not, and tightening it is a migration.
 */
export const SECONDARIES_MAX = 6
export const SECONDARY_DECK_MAX = 60
const SECONDARY_HISTORY_MAX = 30
/** One primary score plus every secondary the bounded battle history can hold. */
export const SCORE_SETTLEMENT_MAX = SECONDARY_HISTORY_MAX + 1

/**
 * Fixed secondaries are chosen once and scored all game; tactical ones are drawn as
 * play goes on. A card's payouts differ between the two, so the battle records which
 * is being played.
 */
export type SecondaryMode = 'fixed' | 'tactical'

export const SECONDARY_MODES: SecondaryMode[] = ['tactical', 'fixed']
type BattlePrep = {
  stratagems: Stratagem[]
  secondaries: Secondary[]
  secondaryDeck?: Secondary[]
  primary: Secondary | null
  secondaryMode: SecondaryMode
}

export type BattleEndReason = 'completed' | 'finished-early' | 'conceded' | 'reported'

export type BattleSettings = {
  limit: number | null
  sizeFromRosters?: boolean
  /**
   * Each side plays to its lists added together and the bigger side sets the size, so a side may play under it. Without
   * it, as in older logs, a duel's lists match the size and a team battle takes its biggest list's.
   */
  sizeFromSides?: boolean
  missionPackId: string | null
  terrainLayoutId: string | null
  twistId: string | null
  teamBattle: boolean
  playerCount: 2 | 3 | 4
  /** How many players each side seats, set while the table is still filling; absent where the seats were filled at creation. */
  places?: [number, number]
  /** What each army on a side may spend in a team battle, by side; absent splits the battle size evenly. */
  armyPoints?: number[]
  /** Doubles allies spend their side's points between them, in any split, rather than each army its own share; a 2v1 pair always does. */
  sharedArmyPoints?: boolean
  /** The table keeps its own score: no mission pack, cards, caps, automatic CP or battle ready bonus. */
  manual?: boolean
  /** The time each side has for the whole battle on its chess clock; absent means no limit. */
  clockLimitMinutes?: number
}

const DEFAULT_SETTINGS: BattleSettings = {
  limit: null,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  teamBattle: false,
  playerCount: PLAYERS_PER_BATTLE,
}

/**
 * The conventional matched-play ceilings, shown as guidance and never enforced.
 *
 * Refusing a score on a number this file is not certain of would stop a real game
 * at a real table, which is far worse than displaying a total that has gone past
 * what the mission allows.
 */
export const PRIMARY_GUIDE = 50
export const SECONDARY_GUIDE = 40
export const PAINTED_ARMY_POINTS = 10

/**
 * What the battle ready bonus pays a side, which is the same for one army or two.
 *
 * A side of allies fields one army between them, so it claims the bonus once and only
 * when all of it is painted — an ally who brought an unpainted half costs the side the
 * whole bonus, exactly as an unpainted half of one player's army would.
 */
export function sidePaintedPoints(state: BattleState, side: number): number {
  if (state.settings.manual) return 0
  const seated = sidePlayers(state, side)
  return seated.length && seated.every((player) => player.painted) ? PAINTED_ARMY_POINTS : 0
}

type OnBehalfOf = { playerId?: PlayerId }

/** A moment of play: the battle round, the phase, and a player whose side was taking that turn. */
export type BattleMoment = { round: number; phase: Phase; turn: PlayerId }
/** The earlier moment an action recorded late belongs to; absent means the moment being played. */
type Missed = { missed?: BattleMoment }

export type Command =
  | {
      kind: 'configure-battle'
      limit: number | null
      missionPackId: string | null
      terrainLayoutId: string | null
      twistId: string | null
      teamBattle?: boolean
      playerCount?: 2 | 3 | 4
      /** How many players each side seats, which the battle's open places are counted from. */
      places?: [number, number]
      /** A team battle's points per army, by side; absent or null splits the battle size evenly. */
      armyPoints?: number[] | null
      sharedArmyPoints?: boolean
      sizeFromSides?: boolean
      clockLimitMinutes: number | null
      manual?: boolean
    }
  | { kind: 'reset-setup' }
  /** Only older logs carry it; setup progress is otherwise derived from the log. */
  | { kind: 'set-setup-step'; step: number }
  /** Marks a setup section whose default is already a valid answer as done, or not, for the whole table. */
  | { kind: 'set-setup-checked'; step: number; checked: boolean }
  | { kind: 'set-attacker'; attackerId: PlayerId }
  | { kind: 'set-first-turn'; firstPlayerId: PlayerId }
  | { kind: 'set-side-disposition'; side: number; disposition: string }
  | { kind: 'set-side-warlord'; side: number; playerId: PlayerId }
  | ({ kind: 'attach-roster'; roster: Roster; prep?: BattlePrep | null; painted?: boolean } & OnBehalfOf)
  | ({ kind: 'detach-roster' } & OnBehalfOf)
  /** The group whose table this battle counts on, by internal id since every battle is public and a group's token is its invite. */
  | { kind: 'set-battle-group'; groupId: string | null }
  | {
      kind: 'lock-sealed-event-rosters'
      sealedEventToken: string
      eventToken?: string
      /** Each allied side's card, sealed with the event's rosters so it cannot be chosen after seeing the opponent's list. */
      dispositions?: { side: number; disposition: string }[]
      /** Each allied side's Warlord, by player, sealed with the event's rosters for the same reason. */
      warlords?: { side: number; playerId: PlayerId }[]
    }
  | ({ kind: 'set-unit'; unitKey: string; destroyed: boolean } & OnBehalfOf)
  | ({ kind: 'wound-unit'; unitKey: string; delta: number } & OnBehalfOf)
  /** `delta` is the change in wounds left, so a unit taking damage is negative, like models. */
  | ({ kind: 'damage-unit'; unitKey: string; delta: number } & OnBehalfOf)
  | ({ kind: 'deploy-unit'; unitKey: string; deployed: boolean } & OnBehalfOf)
  | ({ kind: 'set-unit-formation'; unitKey: string; formation: UnitFormation; transportKey?: string } & OnBehalfOf)
  | ({ kind: 'set-painted'; painted: boolean } & OnBehalfOf)
  | { kind: 'set-deployment'; patternId: string | null }
  | { kind: 'set-battlefield'; patternId: string; terrainLayoutId: string }
  /** The organizer's battlefield for a tournament table, which its players can't change. */
  | { kind: 'fix-battlefield'; patternId: string; terrainLayoutId: string }
  /** The organizer's chess clock limit for an event's battle, which its players can't change; null hands the choice back to them. */
  | { kind: 'fix-clock'; minutes: number | null }
  | ({
      kind: 'set-prep'
      stratagems: Stratagem[]
      secondaries: Secondary[]
      secondaryDeck?: Secondary[]
      primary: Secondary | null
      secondaryMode: SecondaryMode
    } & OnBehalfOf)
  /** `cp` overrides the printed cost, for the stratagems whose price depends on the board. */
  | ({ kind: 'use-stratagem'; key: string; cp?: number } & OnBehalfOf & Missed)
  | ({ kind: 'use-new-orders'; stratagemKey: string; secondaryKey: string; secondary: Secondary; cp?: number } & OnBehalfOf)
  | ({ kind: 'score-secondary'; key: string; delta: number } & OnBehalfOf)
  | ({
      kind: 'score-settlement'
      scores: (
        | { category: 'primary'; delta: number; final?: { claims: number[]; delta: number } }
        | { category: 'secondary'; key: string; delta: number; status?: 'achieved' }
      )[]
      /**
       * The battle round these points belong to, when a turn that has already ended
       * owed them. Absent means the round being played, which is what the settlement
       * of the current turn always means and what every log written before this
       * field existed meant.
       */
      round?: number
    } & OnBehalfOf &
      Missed)
  | ({ kind: 'set-secondary-status'; key: string; status: SecondaryStatus } & OnBehalfOf)
  | ({ kind: 'draw-secondary'; secondary: Secondary } & OnBehalfOf)
  | ({ kind: 'draw-secondaries'; secondaries: Secondary[]; selected?: true } & OnBehalfOf)
  | ({ kind: 'select-mission'; cardKey: string; occurrence: number; selection: MissionSelection } & OnBehalfOf)
  | ({ kind: 'acknowledge-draw' } & OnBehalfOf)
  | ({ kind: 'acknowledge-scoring' } & OnBehalfOf)
  /** Only in logs from before secret missions were retired: the card folds as an ordinary draw, and its reveal as nothing. */
  | ({ kind: 'select-secret'; secondary: Secondary } & OnBehalfOf)
  | ({ kind: 'reveal-secret' } & OnBehalfOf)
  | { kind: 'begin-battle'; firstPlayerId: PlayerId; attackerId?: PlayerId }
  | ({ kind: 'adjust-cp'; delta: number } & OnBehalfOf & Missed)
  | ({ kind: 'resolve-tactical-hand'; keys?: string[]; gainCp?: boolean } & OnBehalfOf)
  | ({ kind: 'score'; category: 'primary' | 'secondary'; delta: number } & OnBehalfOf)
  | { kind: 'correct-player'; playerId: PlayerId; resource: 'cp' | 'primary' | 'secondary'; delta: number }
  | { kind: 'settle-opponent-turn' }
  | ({ kind: 'request-advance' } & OnBehalfOf)
  | ({ kind: 'cancel-advance' } & OnBehalfOf)
  | ({ kind: 'advance' } & OnBehalfOf)
  | { kind: 'pause-clock' }
  | { kind: 'resume-clock' }
  /** Hands the clock to a side, such as for a reaction in the other side's turn, until the phase ends. */
  | { kind: 'switch-clock'; side: number }
  | { kind: 'end-battle'; reason?: BattleEndReason; concededBy?: PlayerId }
  | { kind: 'reopen-battle' }
  /** A tournament table's final score, for a game that wasn't tracked here. `vp` is each seat's total. */
  | { kind: 'report-result'; vp: Record<PlayerId, number> }
  | { kind: 'add-note'; text: string }
  | { kind: 'undo'; target: number }

/** The longest battle note, which joins the report every reader of the battle sees. */
export const NOTE_MAX_LENGTH = 500

/** Mission, card and stratagem automation that a manually tracked battle does not play. */
const GUIDED_COMMANDS: ReadonlySet<Command['kind']> = new Set([
  'select-mission',
  'set-attacker',
  'set-side-disposition',
  'set-deployment',
  'set-battlefield',
  'fix-battlefield',
  'report-result',
  'set-prep',
  'use-stratagem',
  'use-new-orders',
  'score-secondary',
  'score-settlement',
  'set-secondary-status',
  'draw-secondary',
  'draw-secondaries',
  'acknowledge-draw',
  'acknowledge-scoring',
  'resolve-tactical-hand',
  'settle-opponent-turn',
  'request-advance',
  'cancel-advance',
])

/**
 * Why a command was refused, as a stable name that carries no unit, card, number, or player text.
 *
 * Telemetry and agents may read it where the message may not travel. `unclassified`
 * is a product database refusal this release's rules do not reproduce.
 */
export type RefusalCode =
  | 'advance-not-requested'
  | 'advance-requested'
  | 'battle-not-over'
  | 'battle-not-running'
  | 'battle-not-started'
  | 'battle-over'
  | 'battle-started'
  | 'below-zero'
  | 'card-already-drawn'
  | 'card-not-in-deck'
  | 'cards-owed'
  | 'cards-settled'
  | 'clock-unchanged'
  | 'group-ineligible'
  | 'group-members-only'
  | 'concession-required'
  | 'cp-gain-limit'
  | 'deployment-mismatch'
  | 'disposition-not-brought'
  | 'warlord-not-brought'
  | 'draw-limit'
  | 'draw-unreviewed'
  | 'formation-unsupported'
  | 'mission-selection-invalid'
  | 'mission-selection-timing'
  | 'mission-selection-owner'
  | 'mission-selection-recorded'
  | 'mission-selection-unit'
  | 'mission-selection-count'
  | 'mission-selection-facts'
  | 'mission-selection-objective'
  | 'missed-moment'
  | 'missed-unsupported'
  | 'hand-acknowledged'
  | 'invalid-amount'
  | 'invalid-detachments'
  | 'invalid-draw'
  | 'invalid-note'
  | 'invalid-prep'
  | 'invalid-roster'
  | 'invalid-settlement'
  | 'invalid-sides'
  | 'invalid-transport'
  | 'sealed-event-sealed'
  | 'battlefield-fixed'
  | 'clock-fixed'
  | 'organizer-only'
  | 'not-a-tournament-table'
  | 'manual-tracking'
  | 'matchup-not-in-pack'
  | 'missing-deployment'
  | 'missing-disposition'
  | 'missing-warlord'
  | 'missing-player'
  | 'missing-roster'
  | 'missing-terrain'
  | 'mission-cards-mismatch'
  | 'mission-cards-unprepared'
  | 'no-active-secondaries'
  | 'no-roster'
  | 'not-end-of-turn'
  | 'not-enough-cp'
  | 'not-seated'
  | 'not-tactical'
  | 'not-your-turn'
  | 'nothing-discarded'
  | 'nothing-to-acknowledge'
  | 'nothing-to-settle'
  | 'nothing-to-undo'
  | 'out-of-range'
  | 'practice-concession'
  | 'reserves-over-limit'
  | 'roster-format-mismatch'
  | 'invalid-army-points'
  | 'over-army-points'
  | 'allies-mismatch'
  | 'roster-size-mismatch'
  | 'score-by-name'
  | 'score-cap-battle'
  | 'score-cap-card'
  | 'score-cap-round'
  | 'scoring-reviewed'
  | 'scoring-unreviewed'
  | 'seat-count-mismatch'
  | 'secondary-history-full'
  | 'secondary-not-active'
  | 'secret-missions-unsupported'
  | 'settlement-owed'
  | 'stratagem-limit'
  | 'stratagem-wrong-phase'
  | 'stratagem-wrong-turn'
  | 'tactical-hand-unreviewed'
  | 'terrain-geometry-missing'
  | 'terrain-mismatch'
  | 'too-few-seats'
  | 'too-many-players'
  | 'transport-capacity-unknown'
  | 'transport-full'
  | 'transport-ineligible'
  | 'undo-not-latest'
  | 'unit-unchanged'
  | 'unknown-command'
  | 'unknown-deployment'
  | 'unknown-player'
  | 'unknown-secondary'
  | 'unknown-setup-step'
  | 'unknown-side'
  | 'unknown-stratagem'
  | 'unknown-terrain'
  | 'unknown-unit'
  | 'unnamed-card'
  | 'unsupported-battle-size'
  | 'unsupported-player-count'
  | 'wounds-unknown'
  | 'wrong-settlement-turn'
  | 'unclassified'

export type Refusal = { code: RefusalCode; message: string }

/** `stale` carries the sequence the caller should have had; `refused` carries the domain reason as a code and a message. */
export type SubmitResult =
  | { outcome: 'appended'; seq: number }
  | { outcome: 'stale'; seq: number }
  | { outcome: 'refused'; code: RefusalCode; reason: string }

export type LoggedCommand = { operationId?: string; seq: number; by: PlayerId; at: number; command: Command }

export type PlayerState = {
  id: PlayerId
  side: number
  automated: boolean
  cp: number
  cpGained: number
  cpSpent: number
  cpByRound: number[]
  /** Additional rules-limited gains, excluding the command-phase grant and corrections. */
  bonusCpByRound: number[]
  /**
   * The fewest CP held during each moment played and the CP it closed with, keyed by
   * `momentOrder`, so a missed spend placed at the end of its moment cannot overdraw any moment since.
   */
  cpByMoment: Record<number, { fewest: number; last: number }>
  primary: number
  secondary: number
  roster: Roster | null
  rosterSeq: number | null
  /** Empty for a pasted list: nothing there names the units. */
  units: UnitState[]
  stratagems: Stratagem[]
  /** Every use, with when it happened, so a limit can be judged against the log. */
  uses: StratagemUse[]
  secondaries: Secondary[]
  /**
   * The cards this side's current turn has dealt, in the order they came off the deck.
   *
   * The keys and not a tally, because a card may only be put back the moment it is
   * drawn: a hand carries unscored cards from turn to turn, and a count cannot tell
   * the two apart. It is also what says which draw a card put back was using, so
   * putting one back frees the slot it took rather than any slot at all.
   */
  secondariesDrawnThisTurn: string[]
  additionalSecondaryDrawsThisTurn: number
  secondariesToReview: string[]
  secondaryDrawSeq: Record<string, number>
  /** The moment each drawn card arrived, so a missed score cannot predate the card. */
  secondaryDrawnAt: Record<string, number>
  missionSelections: SavedMissionSelection[]
  /** This side's primary mission for its ordered disposition matchup. */
  primaryCard: Secondary | null
  secondaryMode: SecondaryMode
  secondaryDeck: Secondary[] | null
  /** What each named secondary has scored, keyed the same way. */
  scored: Record<string, number>
  /** Per-round ledgers are folded from score commands, never stored separately. */
  primaryByRound: number[]
  finalPrimary: number
  secondaryByRound: number[]
  scoredByRound: Record<string, number[]>
  secondaryStatus: Record<string, SecondaryStatus>
  painted: boolean
  corrections: { cp: number; primary: number; secondary: number }
  correctionByRound: { primary: number[]; secondary: number[] }
}

/** `name` and `cp` are what the use said at the time, so a later pool or price change cannot rewrite it. */
type StratagemUse = { key: string; name: string; cp: number; round: number; phase: Phase; turn: PlayerId | null }

export const BATTLE_STATUSES = ['setup', 'playing', 'finished'] as const
export type BattleStatus = (typeof BATTLE_STATUSES)[number]

export type BattleState = {
  status: BattleStatus
  /** The shared setup section shown on every seated device. */
  setupStep: number
  /** The setup sections the table has marked done, in ascending order. */
  setupChecked: number[]
  /** 0 during setup, then 1 through `BATTLE_ROUNDS`. */
  round: number
  phase: Phase
  activePlayerId: PlayerId | null
  turnSeq: number
  firstPlayerId: PlayerId | null
  attackerId: PlayerId | null
  /**
   * The Force Disposition each side plays, where its armies offered more than one.
   *
   * A side of allies fields one army between them and plays one card, chosen from
   * those either list's detachments offered. A lone army plays its list's own card,
   * which is why this is empty for every duel.
   */
  sideDispositions: Record<number, string>
  /** Set when a sealed event lock sealed every side's card, which setup can then no longer change. */
  dispositionsSealed: boolean
  /**
   * The army whose Warlord leads each side of allies, by player.
   *
   * Every list names its own Warlord so it can be played alone or alongside another,
   * and allies who combine theirs field one Warlord between them.
   */
  sideWarlords: Record<number, PlayerId>
  /** Set when a sealed event lock sealed every side's Warlord, which setup can then no longer change. */
  warlordsSealed: boolean
  resumePlayerId: PlayerId | null
  pendingSettlement: { playerId: PlayerId; round: number } | null
  completionPending: boolean
  advanceRequested: boolean
  scoringAcknowledged: boolean
  drawAcknowledged: boolean
  /** The battlefield both players are using. Shared, so either may set it. */
  deploymentId: string | null
  sealedEventToken: string | null
  /** An organizer chose this battlefield, so the players can't change it. */
  battlefieldFixed: boolean
  /** An organizer set the chess clock limit, so the players can't change it. */
  clockFixed: boolean
  /** What a reported score replaced, so reopening it puts the table back where it was. */
  beforeReport: ReportedFrom | null
  eventToken: string | null
  groupId: string | null
  settings: BattleSettings
  result: { reason: BattleEndReason; concededBy: PlayerId | null } | null
  players: PlayerState[]
  /** Shared by the table, so a break counts against nobody's turn. */
  clockPaused: boolean
  /** The side a switch handed the clock to in this phase; null gives it to the side taking the turn. */
  clockSide: number | null
  /**
   * The newest command still standing. Undo reaches only this one, which keeps
   * the log linear: there is never a hole in the middle to reason about.
   */
  undoable: { seq: number; by: PlayerId; kind: Command['kind'] } | null
  /** The highest seq in the log, undone commands included. The concurrency token. */
  seq: number
}

/**
 * Folds the log into current state. Undo is itself a command, so history is only
 * ever appended to; a command it names is skipped by the fold rather than removed.
 */
export function reduceBattle(
  playerIds: readonly PlayerId[],
  log: readonly LoggedCommand[],
  playerSides?: readonly number[],
  automatedPlayerIds: readonly PlayerId[] = [],
): BattleState {
  const state = emptyBattle(playerIds, playerSides, automatedPlayerIds)
  for (const _step of replay(state, log)) {
    // The fold is the point; every step is already applied to `state`.
  }
  return state
}

/** One command as it actually happened, and what the fold knew either side of it. */
type BattleStep = {
  entry: LoggedCommand
  before: { round: number; phase: Phase; active: PlayerId | null }
  /** The army the command changed, which is not always the one that sent it. */
  army: PlayerState | undefined
}

/**
 * Replays the log into `state`, one standing command at a time.
 *
 * Undo is itself a command, so a command it names is skipped rather than removed —
 * which is why replaying is the only way to know what actually happened. The state
 * yielded through is the live fold, so a caller reads it during its own step and
 * never keeps it.
 */
export function* replay(state: BattleState, log: readonly LoggedCommand[]): Generator<BattleStep> {
  const undone = new Set<number>()
  for (const entry of log) {
    if (entry.command.kind === 'undo') undone.add(entry.command.target)
    state.seq = Math.max(state.seq, entry.seq)
  }

  for (const entry of log) {
    if (entry.command.kind === 'undo' || undone.has(entry.seq)) continue
    const before = { round: state.round, phase: state.phase, active: state.activePlayerId }
    applyEntry(state, entry)
    const actor = state.players.find((candidate) => candidate.id === entry.by)
    const targetId = commandTarget(entry.command, entry.by)
    yield {
      entry,
      before,
      army: actor ? targetArmy(state, actor, entry.command) : state.players.find((candidate) => candidate.id === targetId),
    }
  }
}

/** Commands that change what is left of a unit, which the table corrects by pressing the opposite control. */
const CASUALTY_COMMANDS: readonly Command['kind'][] = ['set-unit', 'wound-unit', 'damage-unit']

/** Applies one command that is standing when it is folded, and records whether undo may name it. */
export function applyEntry(state: BattleState, entry: LoggedCommand) {
  apply(state, entry.by, entry.command, entry.seq)
  recordBeaconDestruction(state)
  const now = playedMoment(state)
  if (now) {
    const order = momentOrder(state, now)
    for (const player of state.players) {
      const fewest = Math.min(player.cpByMoment[order]?.fewest ?? player.cp, player.cp)
      player.cpByMoment[order] = { fewest, last: player.cp }
    }
  }
  if (
    entry.command.kind === 'begin-battle' ||
    entry.command.kind === 'lock-sealed-event-rosters' ||
    entry.command.kind === 'fix-battlefield' ||
    entry.command.kind === 'fix-clock'
  )
    state.undoable = null
  else if (
    ![
      'settle-opponent-turn',
      'request-advance',
      'cancel-advance',
      'acknowledge-draw',
      'acknowledge-scoring',
      'pause-clock',
      'resume-clock',
      'switch-clock',
      // Casualties are corrected through their own counters, so tapping one never takes Undo away from the last action.
      ...CASUALTY_COMMANDS,
    ].includes(entry.command.kind)
  ) {
    state.undoable = { seq: entry.seq, by: entry.by, kind: entry.command.kind }
  }
}

/** A seat before anything has happened to it. */
function freshPlayer(id: PlayerId, side: number, automated: boolean): PlayerState {
  return {
    id,
    side,
    automated,
    cp: 0,
    cpGained: 0,
    cpSpent: 0,
    cpByRound: Array(BATTLE_ROUNDS).fill(0),
    bonusCpByRound: Array(BATTLE_ROUNDS).fill(0),
    cpByMoment: {},
    primary: 0,
    secondary: 0,
    roster: null,
    rosterSeq: null,
    units: [],
    stratagems: [],
    uses: [],
    secondaries: [],
    secondariesDrawnThisTurn: [],
    additionalSecondaryDrawsThisTurn: 0,
    secondariesToReview: [],
    secondaryDrawSeq: {},
    secondaryDrawnAt: {},
    missionSelections: [],
    primaryCard: null,
    secondaryMode: 'tactical',
    secondaryDeck: null,
    scored: {},
    primaryByRound: Array(BATTLE_ROUNDS).fill(0),
    finalPrimary: 0,
    secondaryByRound: Array(BATTLE_ROUNDS).fill(0),
    scoredByRound: {},
    secondaryStatus: {},
    painted: false,
    corrections: { cp: 0, primary: 0, secondary: 0 },
    correctionByRound: { primary: Array(BATTLE_ROUNDS).fill(0), secondary: Array(BATTLE_ROUNDS).fill(0) },
  }
}

/** A battle before anything has happened in it, which is what a replay folds into. */
export function emptyBattle(
  playerIds: readonly PlayerId[],
  playerSides?: readonly number[],
  automatedPlayerIds: readonly PlayerId[] = [],
): BattleState {
  return {
    status: 'setup',
    setupStep: 0,
    setupChecked: [],
    round: 0,
    phase: 'command',
    activePlayerId: null,
    turnSeq: 0,
    firstPlayerId: null,
    attackerId: null,
    sideDispositions: {},
    dispositionsSealed: false,
    sideWarlords: {},
    warlordsSealed: false,
    resumePlayerId: null,
    pendingSettlement: null,
    completionPending: false,
    advanceRequested: false,
    scoringAcknowledged: false,
    drawAcknowledged: false,
    deploymentId: null,
    sealedEventToken: null,
    battlefieldFixed: false,
    clockFixed: false,
    beforeReport: null,
    eventToken: null,
    groupId: null,
    settings: { ...DEFAULT_SETTINGS },
    result: null,
    players: playerIds.map((id, index) => freshPlayer(id, playerSides?.[index] ?? index, automatedPlayerIds.includes(id))),
    undoable: null,
    seq: 0,
    clockPaused: false,
    clockSide: null,
  }
}

/** Why `by` may not run `command` against `state`, as the message a player reads, or null when they may. */
export function validate(state: BattleState, by: PlayerId, command: Command, organizer = false): string | null {
  return commandRefusal(state, by, command, organizer)?.message ?? null
}

/**
 * The prompts a table works through before play moves on, which another tracker recorded
 * the game without: settling and reviewing each turn, drawing a full hand, and the cap on
 * extra command points. Skipping them changes no total the fold reaches.
 */
const IMPORTED_GATES: ReadonlySet<RefusalCode> = new Set([
  'settlement-owed',
  'cards-owed',
  'draw-unreviewed',
  'scoring-unreviewed',
  'tactical-hand-unreviewed',
  'draw-limit',
  'cp-gain-limit',
])

/**
 * `validate` for a battle copied from another tracker. It may also have ended a game early
 * without a concession, the way older logs here still do.
 */
export function importedCommandRefusal(state: BattleState, by: PlayerId, command: Command): string | null {
  if (command.kind === 'end-battle' && command.reason === 'finished-early' && state.status === 'playing') return null
  const refusal = commandRefusal(state, by, command)
  return refusal && !IMPORTED_GATES.has(refusal.code) ? refusal.message : null
}

/**
 * Why `by` may not run `command` against `state`, or null when they may.
 *
 * Every rule about turn order, ownership and legality lives here. The server
 * calls it before appending; the UI calls it to decide what to render enabled.
 *
 * `organizer` says that `by` runs the event this battle counts for, which only the
 * caller can know. Without a seat, an organizer may only reopen the finished
 * battle, so that its players can correct the result.
 */
export function commandRefusal(state: BattleState, by: PlayerId, command: Command, organizer = false): Refusal | null {
  if (command.kind === 'report-result') {
    if (!state.sealedEventToken) return refuse('not-a-tournament-table', 'only a tournament table can report a score')
    if (state.status === 'finished') return refuse('battle-over', 'the battle is over')
    if (!organizer && !state.players.some((candidate) => candidate.id === by)) return refuse('not-seated', 'you are not in this battle')
    const seats = state.players.map((candidate) => candidate.id)
    if (seats.length !== Object.keys(command.vp).length || seats.some((id) => command.vp[id] === undefined))
      return refuse('unknown-player', 'give a score for each player')
    return null
  }
  if (command.kind === 'fix-battlefield') {
    if (!organizer) return refuse('organizer-only', 'only the organizer can set this battlefield')
    return state.status === 'setup' ? null : refuse('battle-started', 'the battle has started')
  }
  if (command.kind === 'fix-clock') {
    if (!organizer) return refuse('organizer-only', 'only the organizer can set this chess clock')
    return state.status === 'setup' ? null : refuse('battle-started', 'the battle has started')
  }
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor)
    return organizer && command.kind === 'reopen-battle' ? reopenRefusal(state) : refuse('not-seated', 'you are not in this battle')
  if ('playerId' in command && command.playerId && !state.players.some((candidate) => candidate.id === command.playerId)) {
    return refuse('unknown-player', 'that player is not in this battle')
  }
  const player = targetArmy(state, actor, command)
  if (state.settings.manual && GUIDED_COMMANDS.has(command.kind))
    return refuse('manual-tracking', 'this battle is tracked manually, without missions or stratagems')

  switch (command.kind) {
    case 'select-mission':
      return missionSelectionRefusal(state, by, player, command)
    case 'configure-battle': {
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (
        state.battlefieldFixed &&
        (command.terrainLayoutId !== state.settings.terrainLayoutId || command.missionPackId !== state.settings.missionPackId)
      )
        return refuse('battlefield-fixed', 'the organizer set this battlefield')
      if (state.clockFixed && command.clockLimitMinutes !== (state.settings.clockLimitMinutes ?? null))
        return refuse('clock-fixed', 'the organizer set this chess clock')
      if (command.manual && state.sealedEventToken) return refuse('sealed-event-sealed', 'this battle plays its event’s mission pack')
      if (command.manual && state.groupId) return refuse('group-ineligible', 'a battle counting for a group keeps its missions and scoring')
      if (command.manual && (command.missionPackId || command.twistId || command.terrainLayoutId))
        return refuse('manual-tracking', 'a manually tracked battle has no mission pack')
      if (state.sealedEventToken && command.limit !== state.settings.limit)
        return refuse('sealed-event-sealed', 'this battle’s size is sealed')
      if (state.sealedEventToken && (command.teamBattle ?? false) !== state.settings.teamBattle)
        return refuse('sealed-event-sealed', 'this battle’s sides are sealed')
      if (state.sealedEventToken && battleCapacity(command) !== battleCapacity(state.settings))
        return refuse('sealed-event-sealed', 'this battle’s seats are sealed')
      if (command.playerCount !== undefined && command.playerCount !== 2 && command.playerCount !== 3 && command.playerCount !== 4)
        return refuse('unsupported-player-count', 'choose a supported player count')
      // A setup change that leaves the places out keeps the ones the table already has.
      const places = command.places ?? state.settings.places
      if (places) {
        if (state.sealedEventToken) return refuse('sealed-event-sealed', 'this battle’s seats are sealed')
        if (!places.every((count) => count === 1 || count === 2))
          return refuse('unsupported-player-count', 'choose a supported player count')
        if (command.playerCount !== undefined && command.playerCount !== battleCapacity({ places }))
          return refuse('seat-count-mismatch', 'choose matching battle sides and seats')
        if (state.players.some((candidate) => sidePlayers(state, candidate.side).length > places[candidate.side]!))
          return refuse('too-few-seats', 'remove a player before removing their place')
      }
      if (battleCapacity({ ...command, places }) > PLAYERS_PER_BATTLE !== Boolean(command.teamBattle))
        return refuse('seat-count-mismatch', 'choose matching battle sides and seats')
      if (battleCapacity({ ...command, places }) < state.players.length)
        return refuse('too-few-seats', 'choose enough seats for every player')
      if (command.limit !== null && !isGameSize(command.limit)) return refuse('unsupported-battle-size', 'choose a supported battle size')
      if (command.teamBattle && isKotcLimit(command.limit)) return refuse('unsupported-battle-size', 'choose a supported battle size')
      if (state.sealedEventToken && JSON.stringify(command.armyPoints ?? null) !== JSON.stringify(state.settings.armyPoints ?? null))
        return refuse('sealed-event-sealed', 'this battle’s points are sealed')
      if (state.sealedEventToken && (command.sharedArmyPoints ?? false) !== (state.settings.sharedArmyPoints ?? false))
        return refuse('sealed-event-sealed', 'this battle’s points are sealed')
      if (command.sharedArmyPoints && !command.teamBattle)
        return refuse('invalid-army-points', 'only a team battle shares points between allies')
      if (command.armyPoints) {
        if (!command.teamBattle) return refuse('invalid-army-points', 'only a team battle sets points per army')
        if (command.armyPoints.length !== 2 || !command.armyPoints.every(validArmyPoints))
          return refuse('invalid-army-points', ARMY_POINTS_ERROR)
      }
      return null
    }
    case 'reset-setup':
      if (state.sealedEventToken) return refuse('sealed-event-sealed', 'these rosters are sealed')
      return state.status === 'setup' ? null : refuse('battle-started', 'the battle has started')
    case 'set-setup-step':
    case 'set-setup-checked':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      return Number.isInteger(command.step) && command.step >= 0 && command.step <= SETUP_STEP_MAX
        ? null
        : refuse('unknown-setup-step', 'choose a setup section')
    case 'set-attacker':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      return state.players.some((candidate) => candidate.id === command.attackerId)
        ? null
        : refuse('unknown-player', 'that attacker is not in this battle')
    case 'set-first-turn':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      return state.players.some((candidate) => candidate.id === command.firstPlayerId)
        ? null
        : refuse('unknown-player', 'that player is not in this battle')
    case 'set-side-disposition': {
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (state.dispositionsSealed) return refuse('sealed-event-sealed', 'each side’s force disposition is sealed')
      if (state.battlefieldFixed) return refuse('battlefield-fixed', 'the organizer set this battlefield for these Force Dispositions')
      return sideDispositionChoices(state, command.side).includes(command.disposition)
        ? null
        : refuse('disposition-not-brought', 'that force disposition is not one this side brought')
    }
    case 'set-side-warlord': {
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (state.warlordsSealed) return refuse('sealed-event-sealed', 'each side’s Warlord is sealed')
      return sideWarlordChoices(state, command.side).includes(command.playerId)
        ? null
        : refuse('warlord-not-brought', 'that army is not on this side or names no Warlord')
    }
    case 'attach-roster': {
      if (state.sealedEventToken) return refuse('sealed-event-sealed', 'these rosters are sealed')
      if (state.status === 'finished') return refuse('battle-over', 'the battle is over')
      // Correcting a list mid-battle stays allowed; bringing a different set of cards with it does not.
      if (state.status === 'playing' && command.prep) return refuse('cards-settled', 'cards are settled before the battle begins')
      const name = command.roster.name.trim()
      if (!name) return refuse('invalid-roster', 'name your army')
      if (name.length > ROSTER_NAME_MAX_LENGTH) return refuse('invalid-roster', 'that name is too long')
      if (!command.roster.text.trim()) return refuse('invalid-roster', 'paste your list')
      if (command.roster.text.length > ROSTER_MAX_LENGTH) return refuse('invalid-roster', 'that list is too long')
      const built = command.roster.built
      if ((state.status !== 'setup' || !state.settings.sizeFromRosters) && built && !fitsBattleSize(state.settings, built))
        return refuse('roster-size-mismatch', 'that roster does not match the battle size')
      if (built?.detachmentPointBudget !== undefined) {
        const detachmentError = detachmentPointsError(built.detachments ?? [], built.detachmentPointBudget)
        if (detachmentError) return refuse('invalid-detachments', 'invalid detachment combination')
      }
      if (command.prep) {
        const prepError = validatePrep(command.prep)
        if (prepError) return prepError
      }
      return null
    }
    case 'detach-roster': {
      if (state.sealedEventToken) return refuse('sealed-event-sealed', 'these rosters are sealed')
      // Correcting a list mid-battle stays allowed, because a corrected list is still
      // an army. Taking one away is not: the units on the table would have nothing
      // behind them, so a seat is only emptied while the table is being set.
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (!player.roster) return refuse('no-roster', 'that seat has no army')
      return null
    }
    case 'set-battle-group':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (command.groupId === null) return null
      if (state.sealedEventToken) return refuse('group-ineligible', 'this battle already counts for its event')
      if (state.settings.manual) return refuse('group-ineligible', 'a manually tracked battle cannot count for a group')
      if (state.players.some((candidate) => isGuestSeat(candidate.id) || isPracticeSeat(candidate)))
        return refuse('group-ineligible', 'only members playing each other can count for a group')
      return null
    case 'lock-sealed-event-rosters':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (state.sealedEventToken) return refuse('sealed-event-sealed', 'the rosters are already sealed')
      if (!state.players.every((candidate) => candidate.roster)) return refuse('missing-roster', 'every player needs a sealed roster')
      if (command.dispositions?.every(({ side, disposition }) => sideDispositionChoices(state, side).includes(disposition)) === false)
        return refuse('disposition-not-brought', 'that force disposition is not one this side brought')
      return command.warlords?.every(({ side, playerId }) => sideWarlordChoices(state, side).includes(playerId)) === false
        ? refuse('warlord-not-brought', 'that army is not on this side or names no Warlord')
        : null
    case 'begin-battle': {
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      const requiredPlayers = battleCapacity(state.settings)
      if (state.players.length < requiredPlayers) return refuse('missing-player', 'waiting for an opponent')
      if (state.players.length > requiredPlayers) return refuse('too-many-players', 'too many players are seated')
      const sideSizes = [...new Set(state.players.map((candidate) => candidate.side))].map((side) => sidePlayers(state, side).length)
      if (
        sideSizes.length !== 2 ||
        (requiredPlayers === 2 && sideSizes.some((size) => size !== 1)) ||
        (requiredPlayers === 3 && sideSizes.toSorted((left, right) => left - right).join(',') !== '1,2') ||
        (requiredPlayers === 4 && sideSizes.some((size) => size !== 2))
      )
        return refuse('invalid-sides', 'players must be seated on two valid sides')
      if (state.players.some((candidate) => !candidate.roster))
        return state.settings.teamBattle
          ? refuse('missing-roster', 'every army needs a list')
          : refuse('missing-roster', 'both armies need a list')
      if (state.settings.sizeFromRosters && state.settings.limit === null)
        return refuse('roster-format-mismatch', 'choose matching roster formats for each side')
      if (!state.players.some((candidate) => candidate.id === command.firstPlayerId))
        return refuse('unknown-player', 'that player is not in this battle')
      // A side of allies plays one Force Disposition, and it decides the primary each
      // side is set. Starting without it would hand the answer to whichever seat is first.
      if (
        state.players.some(
          (candidate) => sideDispositionChoices(state, candidate.side).length > 1 && !sideDisposition(state, candidate.side),
        )
      )
        return refuse('missing-disposition', 'each side must choose the force disposition it plays')
      if (state.players.some((candidate) => sideWarlordChoices(state, candidate.side).length > 1 && !sideWarlord(state, candidate.side)))
        return refuse('missing-warlord', 'each side of allies must choose whose Warlord leads it')
      if (command.attackerId && !state.players.some((candidate) => candidate.id === command.attackerId))
        return refuse('unknown-player', 'that attacker is not in this battle')
      if (state.players.some((candidate) => candidate.roster?.built && !fitsBattleSize(state.settings, candidate.roster.built))) {
        return refuse('roster-size-mismatch', 'every roster must match the battle size')
      }
      if (!state.settings.teamBattle && !state.settings.sizeFromSides && !pointsBudgetsAgree(state))
        return refuse('roster-format-mismatch', 'choose matching points budgets for each side')
      const armyProblem = teamArmyProblems(state)[0]
      if (armyProblem) return refuse(armyProblem.code, armyProblem.message)
      for (const candidate of state.players) {
        const reserveError = strategicReserveSideError(state, candidate)
        if (reserveError) return reserveError
      }
      return null
    }
    case 'adjust-cp': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'command points move in whole steps')
      if (command.missed) {
        if (state.settings.manual) return refuse('manual-tracking', 'a manually tracked battle records command points as they change')
        const refusal = missedMomentRefusal(state, command.missed)
        if (refusal) return refusal
        if (command.delta < 0) return refuse('missed-unsupported', 'only a missed command point gain can be recorded late')
      }
      if (player.cp + command.delta < 0) return refuse('not-enough-cp', 'not enough command points')
      if (state.settings.manual) return null
      return command.delta > 0 ? bonusCpRefusal(player, command.missed?.round ?? state.round, command.delta) : null
    }
    case 'resolve-tactical-hand': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (state.phase !== 'end' || !sameSide(state, state.activePlayerId, player.id))
        return refuse('not-end-of-turn', 'resolve tactical missions at the end of your turn')
      if (player.secondaryMode !== 'tactical') return refuse('not-tactical', 'only tactical secondaries are resolved each turn')
      const active = activeTacticalSecondaries(player)
      if (!active.length) return refuse('no-active-secondaries', 'there are no active tactical secondaries to resolve')
      const keys = command.keys ?? []
      if (keys.some((key) => !active.some((secondary) => secondary.key === key)))
        return refuse('secondary-not-active', 'that secondary is not active')
      if (command.gainCp && !keys.length) return refuse('nothing-discarded', 'discard a secondary to gain a command point')
      return command.gainCp ? bonusCpRefusal(player, state.round, 1) : null
    }
    case 'score': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'victory points move in whole steps')
      if (player[command.category] + command.delta < 0) return refuse('below-zero', 'that would go below zero')
      // Once secondaries are named, they are scored by name: two ways of adding to
      // the same total is how a breakdown stops adding up.
      if (command.category === 'secondary' && player.secondaries.length) return refuse('score-by-name', 'score the secondary by name')
      return null
    }
    case 'correct-player': {
      if (state.status === 'setup') return refuse('battle-not-started', 'the battle has not started')
      const namedTarget = state.players.find((candidate) => candidate.id === command.playerId)
      if (!namedTarget) return refuse('unknown-player', 'that player is not in this battle')
      const target = sideCaptain(state, namedTarget.side)
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'corrections move in whole steps')
      if (target[command.resource] + command.delta < 0) return refuse('below-zero', 'that would go below zero')
      return null
    }
    case 'settle-opponent-turn': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!state.pendingSettlement) return refuse('nothing-to-settle', 'there is no previous turn to settle')
      return null
    }
    case 'request-advance': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      if (state.completionPending) return refuse('settlement-owed', 'settle the final turn before completing the battle')
      const owed = sideOwes(state, player)
      if (owed === 'settlement') return refuse('settlement-owed', 'settle the previous turn before ending the command phase')
      if (owed === 'cards') return refuse('cards-owed', 'draw every card owed before ending the command phase')
      if (state.phase === 'command' && player.secondariesToReview.length && !state.drawAcknowledged) {
        return refuse('draw-unreviewed', 'review the new secondary missions before ending the command phase')
      }
      if (state.advanceRequested) return refuse('advance-requested', 'the phase is already waiting to advance')
      return null
    }
    case 'cancel-advance': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      if (!state.advanceRequested) return refuse('advance-not-requested', 'the phase is not waiting to advance')
      return null
    }
    case 'acknowledge-scoring': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      if (!state.advanceRequested) return refuse('advance-not-requested', 'the phase is not waiting for scoring')
      if (state.scoringAcknowledged) return refuse('scoring-reviewed', 'scoring has already been reviewed')
      return null
    }
    case 'advance': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      const owed = sideOwes(state, player)
      if (owed === 'settlement') return refuse('settlement-owed', 'settle the previous turn before ending the command phase')
      if (owed === 'cards') return refuse('cards-owed', 'draw every card owed before ending the command phase')
      if (state.phase === 'command' && player.secondariesToReview.length && !state.drawAcknowledged) {
        return refuse('draw-unreviewed', 'review the new secondary missions before ending the command phase')
      }
      const due = scoringDue(state, player)
      if (due.length && !state.advanceRequested) return refuse('scoring-unreviewed', 'review mission scoring before ending the phase')
      if (due.length && !state.scoringAcknowledged) return refuse('scoring-unreviewed', 'finish mission scoring before ending the phase')
      const unresolvedTactical =
        state.phase === 'end' && player.secondaryMode === 'tactical' && activeTacticalSecondaries(player).length > 0
      if (unresolvedTactical && !state.advanceRequested)
        return refuse('tactical-hand-unreviewed', 'review the tactical hand before ending the turn')
      return null
    }
    case 'end-battle': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      // Older logs also hold battles called early; replay still applies them, but a new one only ends by concession.
      if (command.reason !== 'conceded') return refuse('concession-required', 'a battle ends after its last turn or by concession')
      if (!command.concededBy) return refuse('concession-required', 'choose who conceded')
      const concedingPlayer = state.players.find((candidate) => candidate.id === command.concededBy)
      if (!concedingPlayer) return refuse('unknown-player', 'that player is not in this battle')
      if (isPracticeSeat(concedingPlayer)) return refuse('practice-concession', 'a practice opponent cannot concede')
      return null
    }
    case 'reopen-battle':
      return reopenRefusal(state)
    case 'add-note': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!command.text.trim()) return refuse('invalid-note', 'write the note first')
      return command.text.length > NOTE_MAX_LENGTH ? refuse('invalid-note', 'that note is too long') : null
    }
    case 'set-unit': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return refuse('unknown-unit', 'that is not one of your units')
      if (unit.destroyed === command.destroyed)
        return command.destroyed
          ? refuse('unit-unchanged', 'the unit is already lost')
          : refuse('unit-unchanged', 'the unit is already standing')
      return command.destroyed ? null : embarkedCapacityError(player.units, unit, unit.models)
    }
    case 'deploy-unit': {
      if (state.status === 'finished') return refuse('battle-over', 'the battle is over')
      const attached = attachedUnits(player.units, command.unitKey)
      if (!attached.length) return refuse('unknown-unit', 'that is not one of your units')
      return state.status === 'setup' && !command.deployed ? movedReserveError(state, player, attached, 'strategic-reserves') : null
    }
    case 'set-unit-formation': {
      if (state.status === 'finished') return refuse('battle-over', 'the battle is over')
      if (!attachedUnits(player.units, command.unitKey).length)
        return namesAnotherArmy(command, actor)
          ? refuse('unknown-unit', 'that is not one of their units')
          : refuse('unknown-unit', 'that is not one of your units')
      return unitFormationRefusal(state, player, command)
    }
    // The bonus is for a painted army, settled before the battle and paid as it begins.
    case 'set-painted':
      return state.status === 'setup' ? null : refuse('battle-started', 'the battle ready bonus is set before the battle begins')
    case 'wound-unit': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return refuse('unknown-unit', 'that is not one of your units')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'models come off in whole numbers')
      if (unit.alive + command.delta < 0) return refuse('out-of-range', 'there are not that many models left')
      if (unit.alive + command.delta > unit.models) return refuse('out-of-range', 'that is more models than the unit has')
      return embarkedCapacityError(player.units, unit, unit.alive + command.delta)
    }
    case 'damage-unit': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return refuse('unknown-unit', 'that is not one of your units')
      // Refused rather than guessed at: a unit whose models do not share a wounds
      // characteristic has no single number to count against, and inventing one
      // would put a squad's sergeant and his veterans on the same track.
      const left = unitWoundsLeft(unit)
      if (left === null || !unit.wounds)
        return refuse('wounds-unknown', 'the datasheet does not give this unit a single wounds characteristic')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'wounds come off in whole numbers')
      if (left + command.delta < 0) return refuse('out-of-range', 'there are not that many wounds left')
      if (left + command.delta > unit.models * unit.wounds) return refuse('out-of-range', 'that is more wounds than the unit has')
      return embarkedCapacityError(player.units, unit, Math.ceil((left + command.delta) / unit.wounds))
    }
    case 'set-deployment':
    case 'set-battlefield': {
      // The battlefield is shared, so either player may set it, and only before the
      // first turn — moving the deployment zones mid-battle is not a thing.
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (state.battlefieldFixed) return refuse('battlefield-fixed', 'the organizer set this battlefield')
      return null
    }
    case 'set-prep': {
      if (state.status === 'finished') return refuse('battle-over', 'the battle is over')
      if (state.status === 'playing' && !canRepairPlayingPrep(player, command))
        return refuse('cards-settled', 'cards are settled before the battle begins')
      if (isKotcLimit(state.settings.limit) && command.secondaryMode !== 'tactical')
        return refuse('not-tactical', 'King of the Colosseum requires tactical secondaries')
      return validatePrep(command)
    }
    case 'use-stratagem': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.key)
      if (!stratagem) return refuse('unknown-stratagem', 'that is not one of your stratagems')
      if (command.missed) {
        const refusal = missedMomentRefusal(state, command.missed)
        if (refusal) return refusal
        if (isNewOrders(stratagem))
          return refuse('missed-unsupported', 'New Orders draws a replacement card, so it cannot be recorded late')
      }
      return stratagemRefusal(state, player, stratagem, command.cp, command.missed)
    }
    case 'use-new-orders': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.stratagemKey)
      if (!stratagem || !isNewOrders(stratagem)) return refuse('unknown-stratagem', 'New Orders is not in your stratagems')
      const refusal = stratagemRefusal(state, player, stratagem, command.cp)
      if (refusal) return refusal
      if (player.secondaryMode !== 'tactical') return refuse('not-tactical', 'New Orders requires tactical secondary missions')
      if (
        !player.secondaries.some(
          (secondary) => secondary.key === command.secondaryKey && player.secondaryStatus[secondary.key] === 'active',
        )
      ) {
        return refuse('secondary-not-active', 'choose an active secondary mission')
      }
      if (!command.secondary.name.trim()) return refuse('unnamed-card', 'name the replacement secondary')
      if (!player.secondaryDeck?.some((secondary) => secondary.key === command.secondary.key))
        return refuse('card-not-in-deck', 'that secondary is not in your deck')
      if (player.secondaries.some((secondary) => secondary.key === command.secondary.key))
        return refuse('card-already-drawn', 'that secondary has already been drawn')
      if (player.secondaries.length >= SECONDARY_HISTORY_MAX) return refuse('secondary-history-full', 'the secondary history is full')
      return null
    }
    case 'score-secondary': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!holdsSecondary(player, command.key)) return refuse('unknown-secondary', 'that is not one of your secondaries')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'victory points move in whole steps')
      if ((player.scored[command.key] ?? 0) + command.delta < 0) return refuse('below-zero', 'that would go below zero')
      return null
    }
    case 'score-settlement': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!command.scores.length) return refuse('invalid-settlement', 'record at least one score')
      if (command.missed) {
        const refusal = missedScoreRefusal(state, by, player, command, command.missed)
        if (refusal) return refusal
      } else if (command.round !== undefined && command.round !== state.round) {
        // Naming a round is only ever answering the turn that is waiting to be settled.
        // Anything else is a second way to say which round a score belongs to.
        const pending = state.pendingSettlement
        if (!pending || pending.playerId !== player.id || pending.round !== command.round) {
          return refuse('wrong-settlement-turn', 'that is not the turn waiting to be settled')
        }
      }
      const keys = new Set<string>()
      for (const score of command.scores) {
        if (!Number.isInteger(score.delta) || score.delta <= 0)
          return refuse('invalid-amount', 'victory points move in positive whole steps')
        if (score.category === 'primary') {
          if (score.final) {
            const claimed = finalAwardTotal(
              player.primaryCard?.awards ?? [],
              score.final.claims,
              { phase: state.phase, round: state.round, rounds: BATTLE_ROUNDS, endOfBattle: atBattleEnd(state) },
              sameSide(state, player.id, state.activePlayerId ?? ''),
              player.secondaryMode,
            )
            const finalSide = state.completionPending ? state.pendingSettlement?.playerId : state.activePlayerId
            if (
              !atBattleEnd(state) ||
              !sameSide(state, player.id, finalSide ?? '') ||
              player.finalPrimary > 0 ||
              claimed === null ||
              !Number.isInteger(score.final.delta) ||
              score.final.delta <= 0 ||
              score.final.delta > score.delta ||
              score.final.delta > claimed
            )
              return refuse('invalid-settlement', 'those are not available end-of-battle points')
          }
          if (keys.has('primary')) return refuse('invalid-settlement', 'record primary scoring once per settlement')
          keys.add('primary')
          continue
        }
        if (keys.has(score.key)) return refuse('invalid-settlement', 'record each secondary once per settlement')
        keys.add(score.key)
        if (!holdsSecondary(player, score.key)) return refuse('unknown-secondary', 'that is not one of your secondaries')
      }
      return null
    }
    case 'set-secondary-status': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!holdsSecondary(player, command.key)) return refuse('unknown-secondary', 'that is not one of your secondaries')
      return null
    }
    case 'draw-secondary': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (player.secondaryMode !== 'tactical') return refuse('not-tactical', 'only tactical missions are drawn')
      if (player.secondariesDrawnThisTurn.length >= secondaryDrawTarget(player)) {
        return refuse('draw-limit', 'you have already drawn your secondaries this turn')
      }
      if (!command.secondary.name.trim()) return refuse('unnamed-card', 'name the secondary')
      if (player.secondaryDeck && !player.secondaryDeck.some((secondary) => secondary.key === command.secondary.key)) {
        return refuse('card-not-in-deck', 'that secondary is not in your deck')
      }
      if (player.secondaries.some((secondary) => secondary.key === command.secondary.key))
        return refuse('card-already-drawn', 'that secondary has already been drawn')
      if (player.secondaries.length >= SECONDARY_HISTORY_MAX) return refuse('secondary-history-full', 'the secondary history is full')
      return null
    }
    case 'draw-secondaries': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (player.secondaryMode !== 'tactical') return refuse('not-tactical', 'only tactical missions are drawn')
      const refill = Math.min(
        secondaryDrawTarget(player) - player.secondariesDrawnThisTurn.length,
        undrawnSecondaries(player).length,
        SECONDARY_HISTORY_MAX - player.secondaries.length,
      )
      if (!command.secondaries.length || command.secondaries.length !== refill)
        return refuse('invalid-draw', 'draw every card owed for this turn together')
      const keys = new Set<string>()
      for (const secondary of command.secondaries) {
        if (!secondary.name.trim()) return refuse('unnamed-card', 'name the secondary')
        if (keys.has(secondary.key)) return refuse('invalid-draw', 'draw each secondary once')
        keys.add(secondary.key)
        if (player.secondaryDeck && !player.secondaryDeck.some((candidate) => candidate.key === secondary.key)) {
          return refuse('card-not-in-deck', 'that secondary is not in your deck')
        }
        if (player.secondaries.some((candidate) => candidate.key === secondary.key))
          return refuse('card-already-drawn', 'that secondary has already been drawn')
      }
      if (player.secondaries.length + command.secondaries.length > SECONDARY_HISTORY_MAX)
        return refuse('secondary-history-full', 'the secondary history is full')
      return null
    }
    case 'acknowledge-draw': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      if (sideOwes(state, player) === 'cards') return refuse('cards-owed', 'draw every card owed before taking the turn')
      if (!player.secondariesToReview.length) return refuse('nothing-to-acknowledge', 'there is no new hand to acknowledge')
      if (state.drawAcknowledged) return refuse('hand-acknowledged', 'the hand has already been acknowledged')
      return null
    }
    case 'select-secret':
    case 'reveal-secret':
      return refuse('secret-missions-unsupported', 'secret missions are not part of any supported mission pack')
    case 'pause-clock': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (state.clockPaused) return refuse('clock-unchanged', 'the timer is already paused')
      return null
    }
    case 'resume-clock': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!state.clockPaused) return refuse('clock-unchanged', 'the timer is already running')
      return null
    }
    case 'switch-clock': {
      if (state.status !== 'playing' || state.completionPending) return refuse('battle-not-running', 'the battle is not running')
      if (!sidePlayers(state, command.side).length) return refuse('unknown-side', 'that side is not in this battle')
      if (command.side === clockSide(state)) return refuse('clock-unchanged', 'that side already has the clock')
      return null
    }
    case 'undo': {
      if (!state.undoable) return refuse('nothing-to-undo', 'there is nothing to undo')
      if (state.undoable.seq !== command.target) return refuse('undo-not-latest', 'only the last action can be undone')
      return null
    }
    // A new command kind breaks this assignment rather than being quietly allowed.
    default: {
      const unhandled: never = command
      return refuse('unknown-command', `unknown command ${JSON.stringify(unhandled)}`)
    }
  }
}

const reopenRefusal = (state: BattleState) => (state.status === 'finished' ? null : refuse('battle-not-over', 'the battle is not over'))

function apply(state: BattleState, by: PlayerId, command: Command, seq: number) {
  // An event's organizer may reopen a battle without a seat in it, so this one needs no actor.
  if (command.kind === 'reopen-battle') return reopenBattle(state)
  if (command.kind === 'report-result') return reportResult(state, command.vp)
  if (command.kind === 'fix-battlefield') {
    state.deploymentId = command.patternId
    state.settings.terrainLayoutId = command.terrainLayoutId
    state.battlefieldFixed = true
    return
  }
  if (command.kind === 'fix-clock') {
    if (command.minutes) state.settings.clockLimitMinutes = command.minutes
    else delete state.settings.clockLimitMinutes
    state.clockFixed = command.minutes !== null
    return
  }
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor) return
  // A player removed from an open place before the start takes what was done for them with them, rather than handing it to whoever acted.
  if (
    state.settings.places &&
    'playerId' in command &&
    command.playerId &&
    !state.players.some((candidate) => candidate.id === command.playerId)
  )
    return
  const player = targetArmy(state, actor, command)

  switch (command.kind) {
    case 'select-mission':
      applyMissionSelection(state, player, command, seq)
      return
    case 'configure-battle': {
      const missionPackChanged = state.settings.missionPackId !== command.missionPackId
      const places = command.places ?? state.settings.places
      state.settings = {
        limit: command.limit,
        ...(command.limit === null ? { sizeFromRosters: true } : {}),
        missionPackId: command.missionPackId,
        terrainLayoutId: command.terrainLayoutId,
        twistId: command.twistId,
        teamBattle: command.teamBattle ?? false,
        playerCount: battleCapacity({ ...command, places }),
        ...(places ? { places } : {}),
        ...(command.armyPoints ? { armyPoints: command.armyPoints } : {}),
        ...(command.sharedArmyPoints ? { sharedArmyPoints: true } : {}),
        ...(command.sizeFromSides ? { sizeFromSides: true } : {}),
        ...(command.manual ? { manual: true } : {}),
        ...(command.clockLimitMinutes ? { clockLimitMinutes: command.clockLimitMinutes } : {}),
      }
      if (missionPackChanged) {
        state.deploymentId = null
        state.settings.terrainLayoutId = null
      }
      if (command.manual) {
        state.deploymentId = null
        state.attackerId = null
        state.sideDispositions = {}
        for (const candidate of state.players) applyPrep(candidate, null)
      }
      for (const candidate of state.players) {
        if (!state.settings.sizeFromRosters && candidate.roster?.built && !fitsBattleSize(state.settings, candidate.roster.built))
          detachRoster(state, candidate)
      }
      inferBattleSize(state)
      return
    }
    case 'reset-setup': {
      state.setupStep = 0
      state.setupChecked = []
      state.attackerId = null
      state.firstPlayerId = null
      state.sideDispositions = {}
      state.sideWarlords = {}
      if (!state.battlefieldFixed) {
        state.deploymentId = null
        state.settings.terrainLayoutId = null
      }
      state.settings.twistId = null
      for (const seat of state.players) Object.assign(seat, freshPlayer(seat.id, seat.side, seat.automated))
      inferBattleSize(state)
      return
    }
    case 'set-setup-step': {
      state.setupStep = command.step
      return
    }
    case 'set-setup-checked': {
      const others = state.setupChecked.filter((step) => step !== command.step)
      state.setupChecked = command.checked ? [...others, command.step].toSorted((left, right) => left - right) : others
      return
    }
    case 'set-attacker': {
      state.attackerId = command.attackerId
      return
    }
    /**
     * The roll-off both sides watched, recorded before the battle begins.
     *
     * Logged rather than held on the device that saw it, because the section that
     * asks for it and the section that starts the battle are two steps apart: a
     * private answer would let two devices show the table different ones.
     */
    case 'set-first-turn': {
      if (!state.firstPlayerId) {
        for (const candidate of state.players) {
          for (const unit of candidate.units) unit.deployedAtRollOff = unit.formation === 'battlefield'
        }
      }
      state.firstPlayerId = command.firstPlayerId
      return
    }
    case 'set-side-disposition': {
      state.sideDispositions[command.side] = command.disposition
      return
    }
    case 'set-side-warlord': {
      state.sideWarlords[command.side] = command.playerId
      return
    }
    case 'attach-roster': {
      if (state.status === 'setup') state.firstPlayerId = null
      player.roster = { ...command.roster, name: command.roster.name.trim() }
      player.rosterSeq = seq
      // A replaced list is a different army, so nothing about the old one survives.
      const fielded = fieldedUnits(command.roster.built?.units ?? [])
      // A list corrected mid-battle has already deployed, so where it starts no longer applies.
      player.units = state.status === 'setup' ? startingEmbarks(fielded) : fielded
      if (command.prep !== undefined && !state.settings.manual) applyPrep(player, command.prep)
      // Most armies on a table are painted, so a list arrives claiming the bonus and
      // the few that are not turn it off. Only when the command says so: a log from
      // before this carries no claim, and folding one must not invent it a bonus.
      if (command.painted !== undefined) player.painted = command.painted
      if (state.status === 'setup') {
        state.deploymentId = null
        state.settings.terrainLayoutId = null
        inferBattleSize(state)
      }
      return
    }
    case 'detach-roster': {
      detachRoster(state, player)
      inferBattleSize(state)
      return
    }
    case 'set-battle-group':
      state.groupId = command.groupId
      return
    case 'lock-sealed-event-rosters': {
      state.sealedEventToken = command.sealedEventToken
      state.eventToken = command.eventToken ?? null
      if (command.dispositions) {
        for (const { side, disposition } of command.dispositions) state.sideDispositions[side] = disposition
        state.dispositionsSealed = true
      }
      if (command.warlords) {
        for (const { side, playerId } of command.warlords) state.sideWarlords[side] = playerId
        state.warlordsSealed = true
      }
      return
    }
    case 'set-unit':
    case 'wound-unit':
    case 'damage-unit': {
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return
      Object.assign(unit, casualtyOutcome(unit, command))
      disembarkPassengers(player.units, unit)
      return
    }
    case 'deploy-unit': {
      for (const unit of attachedUnits(player.units, command.unitKey)) {
        Object.assign(unit, changedFormation(unit, command.deployed ? 'battlefield' : 'strategic-reserves'))
      }
      return
    }
    case 'set-unit-formation': {
      // The character and the unit he joined start together, so one press moves both.
      const attached = attachedUnits(player.units, command.unitKey)
      const redeployed = redeploysToReserves(state, attached, command.formation)
      for (const unit of attached) {
        Object.assign(unit, changedFormation(unit, command.formation, redeployed, command.transportKey))
      }
      return
    }
    case 'set-painted': {
      player.painted = command.painted
      return
    }
    case 'set-deployment': {
      if (state.deploymentId !== command.patternId) state.settings.terrainLayoutId = null
      state.deploymentId = command.patternId
      return
    }
    case 'set-battlefield': {
      state.deploymentId = command.patternId
      state.settings.terrainLayoutId = command.terrainLayoutId
      return
    }
    case 'set-prep': {
      if (state.status === 'playing' && canRepairPlayingPrep(player, command)) repairPrep(player, command)
      else applyPrep(player, command)
      if (state.status === 'playing' && sameSide(state, state.activePlayerId, player.id)) state.drawAcknowledged = false
      return
    }
    case 'use-stratagem': {
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.key)
      if (!stratagem) return
      applyStratagemUse(state, player, stratagem, command.cp, command.missed)
      return
    }
    case 'use-new-orders': {
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.stratagemKey)
      if (!stratagem) return
      applyStratagemUse(state, player, stratagem, command.cp)
      if (!player.secondariesDrawnThisTurn.includes(command.secondaryKey)) player.additionalSecondaryDrawsThisTurn += 1
      player.secondaryStatus = { ...player.secondaryStatus, [command.secondaryKey]: 'discarded' }
      player.secondariesDrawnThisTurn = player.secondariesDrawnThisTurn.filter((key) => key !== command.secondaryKey)
      player.secondariesToReview = player.secondariesToReview.filter((key) => key !== command.secondaryKey)
      const key = drawCard(state, player, command.secondary, seq)
      player.secondariesDrawnThisTurn.push(key)
      player.secondariesToReview.push(key)
      state.drawAcknowledged = false
      return
    }
    case 'score-secondary': {
      applySecondaryScore(player, command.key, command.delta, state.round)
      return
    }
    case 'score-settlement': {
      // A payout the previous turn owed belongs to the round that turn was in, which
      // the second player passing the turn has already moved the battle out of.
      const round = pointsRound(state, command)
      for (const score of command.scores) {
        if (score.category === 'primary') {
          player.primary += score.delta
          player.finalPrimary += score.final?.delta ?? 0
          player.primaryByRound[round - 1] = (player.primaryByRound[round - 1] ?? 0) + score.delta
          continue
        }
        applySecondaryScore(player, score.key, score.delta, round)
        if (score.status) {
          player.secondaryStatus = { ...player.secondaryStatus, [score.key]: score.status }
        }
      }
      if (state.advanceRequested && !command.missed) state.scoringAcknowledged = true
      return
    }
    case 'set-secondary-status': {
      // A card put back or discarded the moment it is drawn is replaced, not spent: it
      // never occupied one of this turn's two draws, so the count backs off to let the
      // replacement in.
      const wasActive = (player.secondaryStatus[command.key] ?? 'active') === 'active'
      player.secondaryStatus = { ...player.secondaryStatus, [command.key]: command.status }
      if (wasActive && command.status !== 'active') {
        player.secondariesDrawnThisTurn = player.secondariesDrawnThisTurn.filter((key) => key !== command.key)
        player.secondariesToReview = player.secondariesToReview.filter((key) => key !== command.key)
      }
      return
    }
    case 'draw-secondary': {
      const key = drawCard(state, player, command.secondary, seq)
      player.secondariesDrawnThisTurn = [...player.secondariesDrawnThisTurn, key]
      player.secondariesToReview = [...player.secondariesToReview, key]
      state.drawAcknowledged = false
      return
    }
    case 'draw-secondaries': {
      for (const drawn of command.secondaries) drawCard(state, player, drawn, seq)
      player.secondariesDrawnThisTurn = [...player.secondariesDrawnThisTurn, ...command.secondaries.map((drawn) => drawn.key)]
      player.secondariesToReview = [...player.secondariesToReview, ...command.secondaries.map((drawn) => drawn.key)]
      state.drawAcknowledged = false
      return
    }
    case 'acknowledge-draw': {
      state.drawAcknowledged = true
      player.secondariesToReview = []
      return
    }
    case 'acknowledge-scoring': {
      state.scoringAcknowledged = true
      return
    }
    case 'select-secret':
      drawCard(state, player, command.secondary, seq)
      return
    case 'reveal-secret':
      return
    case 'begin-battle': {
      state.status = 'playing'
      state.round = 1
      state.firstPlayerId = command.firstPlayerId
      state.attackerId = command.attackerId ?? state.attackerId ?? command.firstPlayerId
      state.result = null
      enterTurn(state, command.firstPlayerId, null, seq)
      return
    }
    case 'adjust-cp': {
      adjustCp(state, player, command.delta, command.missed)
      return
    }
    case 'resolve-tactical-hand': {
      const keys = command.keys ?? []
      player.secondaryStatus = {
        ...player.secondaryStatus,
        ...Object.fromEntries(keys.map((key) => [key, 'discarded' as const])),
      }
      if (command.gainCp) adjustCp(state, player, 1)
      return
    }
    case 'score': {
      player[command.category] += command.delta
      const ledger = command.category === 'primary' ? player.primaryByRound : player.secondaryByRound
      ledger[state.round - 1] = (ledger[state.round - 1] ?? 0) + command.delta
      return
    }
    case 'correct-player': {
      const namedTarget = state.players.find((candidate) => candidate.id === command.playerId)
      if (!namedTarget) return
      const target = sideCaptain(state, namedTarget.side)
      target[command.resource] += command.delta
      target.corrections[command.resource] += command.delta
      if (command.resource === 'cp') {
        if (state.round) target.cpByRound[state.round - 1] = target.cp
      } else {
        const ledger = command.resource === 'primary' ? target.primaryByRound : target.secondaryByRound
        const round = Math.max(0, state.round - 1)
        ledger[round] = (ledger[round] ?? 0) + command.delta
        const corrections = command.resource === 'primary' ? target.correctionByRound.primary : target.correctionByRound.secondary
        corrections[round] = (corrections[round] ?? 0) + command.delta
      }
      return
    }
    case 'settle-opponent-turn': {
      state.pendingSettlement = null
      if (state.completionPending) {
        state.completionPending = false
        finishBattle(state, { reason: 'completed', concededBy: null })
      }
      return
    }
    case 'request-advance': {
      state.advanceRequested = true
      state.scoringAcknowledged = false
      return
    }
    case 'cancel-advance': {
      state.advanceRequested = false
      state.scoringAcknowledged = false
      return
    }
    case 'advance': {
      state.advanceRequested = false
      state.scoringAcknowledged = false
      // Ending a phase is the turn's own action, so a reaction's clock never carries into the next phase.
      state.clockSide = null
      const next = PHASES.indexOf(state.phase) + 1
      if (next < PHASES.length) {
        if (state.phase === 'command' && state.pendingSettlement?.playerId === player.id) state.pendingSettlement = null
        state.phase = PHASES[next]!
        return
      }
      const advancingPlayer = command.playerId ? player.id : by
      const opponent = state.players.find((candidate) => !sameSide(state, candidate.id, advancingPlayer))
      const endsFirstTurn = command.playerId
        ? sameSide(state, advancingPlayer, state.firstPlayerId ?? '')
        : advancingPlayer === state.firstPlayerId
      if (endsFirstTurn && opponent) {
        enterTurn(state, opponent.id, state.round, seq)
        return
      }
      if (state.round === BATTLE_ROUNDS) {
        if ((endsFirstTurn && !opponent) || state.settings.manual) {
          finishBattle(state, { reason: 'completed', concededBy: null })
          return
        }
        const firstPlayer = state.players.find((candidate) => sameSide(state, candidate.id, state.firstPlayerId ?? ''))
        if (firstPlayer) state.pendingSettlement = { playerId: sideCaptain(state, firstPlayer.side).id, round: state.round }
        state.completionPending = true
        return
      }
      const endedRound = state.round
      state.round++
      if (state.firstPlayerId) {
        enterTurn(state, state.firstPlayerId, endedRound, seq)
      }
      return
    }
    case 'end-battle': {
      state.advanceRequested = false
      state.scoringAcknowledged = false
      state.completionPending = false
      finishBattle(state, { reason: command.reason ?? 'finished-early', concededBy: command.concededBy ?? null })
      return
    }
    case 'add-note':
      return
    case 'pause-clock': {
      state.clockPaused = true
      return
    }
    case 'resume-clock': {
      state.clockPaused = false
      return
    }
    case 'switch-clock': {
      state.clockSide = command.side
      return
    }
    case 'undo': {
      // Never applied: the fold skips what an undo names.
      return
    }
    default: {
      const unhandled: never = command
      throw new Error(`unknown command ${JSON.stringify(unhandled)}`)
    }
  }
}

function applySecondaryScore(player: PlayerState, key: string, delta: number, round: number) {
  player.scored = { ...player.scored, [key]: (player.scored[key] ?? 0) + delta }
  player.secondary = Object.values(player.scored).reduce((total, points) => total + points, player.corrections.secondary)
  const rounds = [...(player.scoredByRound[key] ?? Array(BATTLE_ROUNDS).fill(0))]
  rounds[round - 1] = (rounds[round - 1] ?? 0) + delta
  player.scoredByRound = { ...player.scoredByRound, [key]: rounds }
  player.secondaryByRound[round - 1] = (player.secondaryByRound[round - 1] ?? 0) + delta
}

function detachRoster(state: BattleState, player: PlayerState) {
  state.firstPlayerId = null
  state.deploymentId = null
  state.settings.terrainLayoutId = null
  delete state.sideDispositions[player.side]
  delete state.sideWarlords[player.side]
  player.roster = null
  player.units = []
  player.painted = false
  applyPrep(player, null)
}

function applyPrep(player: PlayerState, prep: BattlePrep | null | undefined) {
  const chosen = prep ?? { stratagems: [], secondaries: [], primary: null, secondaryMode: 'tactical' as const }
  const deck = chosen.secondaryDeck?.map((secondary) => ({ ...secondary, name: secondary.name.trim() })) ?? null
  const unnamedSecondary =
    player.secondary - Object.values(player.scored).reduce((total, points) => total + points, 0) - player.corrections.secondary
  const unnamedByRound = Array.from(
    { length: BATTLE_ROUNDS },
    (_, round) =>
      (player.secondaryByRound[round] ?? 0) -
      Object.values(player.scoredByRound).reduce((total, scores) => total + (scores[round] ?? 0), 0) -
      (player.correctionByRound.secondary[round] ?? 0),
  )
  player.stratagems = chosen.stratagems.map((stratagem) => correctStratagemTiming({ ...stratagem, name: stratagem.name.trim() }))
  player.secondaries = chosen.secondaries.map((secondary) => ({
    ...(deck?.find((candidate) => candidate.key === secondary.key) ?? secondary),
    name: (deck?.find((candidate) => candidate.key === secondary.key)?.name ?? secondary.name).trim(),
  }))
  player.primaryCard = chosen.primary ? { ...chosen.primary, name: chosen.primary.name.trim() } : null
  player.secondaryMode = chosen.secondaryMode
  player.secondaryDeck = deck
  player.secondaryStatus = Object.fromEntries(player.secondaries.map((secondary) => [secondary.key, 'active']))
  const kept = Object.fromEntries(
    Object.entries(player.scored).filter(([key]) => player.secondaries.some((secondary) => secondary.key === key)),
  )
  player.scored = kept
  player.secondary = Object.values(kept).reduce((total, points) => total + points, player.corrections.secondary + unnamedSecondary)
  player.scoredByRound = Object.fromEntries(
    Object.entries(player.scoredByRound).filter(([key]) => player.secondaries.some((secondary) => secondary.key === key)),
  )
  player.secondaryByRound = Array.from(
    { length: BATTLE_ROUNDS },
    (_, round) =>
      Object.values(player.scoredByRound).reduce((total, scores) => total + (scores[round] ?? 0), 0) +
      (player.correctionByRound.secondary[round] ?? 0) +
      (unnamedByRound[round] ?? 0),
  )
}

function repairPrep(player: PlayerState, prep: BattlePrep) {
  const deck = prep.secondaryDeck?.map((secondary) => ({ ...secondary, name: secondary.name.trim() })) ?? null
  player.secondaryDeck = deck
  if (!player.primaryCard && prep.primary) player.primaryCard = { ...prep.primary, name: prep.primary.name.trim() }
  if (player.secondaryMode === 'fixed' && deck) {
    player.secondaries = player.secondaries.map((secondary) => {
      const restored = deck.find((candidate) => candidate.key === secondary.key)
      return restored ? { ...secondary, ...restored } : secondary
    })
  }
}

function canRepairPlayingPrep(player: PlayerState, prep: BattlePrep) {
  const sameKeys = (left: readonly { key: string }[], right: readonly { key: string }[]) =>
    left.length === right.length && left.every((entry, index) => entry.key === right[index]?.key)
  if (player.secondaryDeck?.length || !prep.secondaryDeck?.length) return false
  if (player.secondaryMode !== prep.secondaryMode || !sameKeys(prep.stratagems, player.stratagems)) return false
  if (player.primaryCard && prep.primary?.key !== player.primaryCard.key) return false
  if (player.secondaryMode === 'tactical') return player.secondaries.length === 0 && prep.secondaries.length === 0
  return sameKeys(prep.secondaries, player.secondaries)
}

/** Whether a stratagem's allowance is spent at a moment. `turn` and `phase` reset as play moves on. */
function limitReached(state: BattleState, player: PlayerState, stratagem: Stratagem, moment: BattleMoment): boolean {
  if (stratagem.limit === 'unlimited') return false
  const uses = player.uses.filter((use) => use.key === stratagem.key)
  if (stratagem.limit === 'battle') return uses.length > 0
  if (stratagem.limit === 'battle-round') return uses.some((use) => use.round === moment.round)
  const thatTurn = uses.filter((use) => use.round === moment.round && sameSide(state, use.turn, moment.turn))
  return stratagem.limit === 'turn' ? thatTurn.length > 0 : thatTurn.some((use) => use.phase === moment.phase)
}

export const isNewOrders = (stratagem: Pick<Stratagem, 'name'>) => stratagem.name.trim().toLocaleLowerCase() === 'new orders'

function stratagemRefusal(
  state: BattleState,
  player: PlayerState,
  stratagem: Stratagem,
  overriddenCost?: number,
  missed?: BattleMoment,
): Refusal | null {
  const moment = missed ?? { round: state.round, phase: state.phase, turn: state.activePlayerId ?? '' }
  const when = missed ? 'that' : 'this'
  if (stratagem.phases?.length && !stratagem.phases.includes(moment.phase))
    return refuse('stratagem-wrong-phase', `${stratagem.name} cannot be used in ${when} phase`)
  if (stratagem.turn === 'your-turn' && !sameSide(state, moment.turn, player.id))
    return refuse('stratagem-wrong-turn', `${stratagem.name} is used on your turn`)
  if (stratagem.turn === 'opponent-turn' && sameSide(state, moment.turn, player.id)) {
    return refuse('stratagem-wrong-turn', `${stratagem.name} is used on your opponent’s turn`)
  }
  const cost = overriddenCost ?? stratagem.cp
  if (!Number.isInteger(cost) || cost < 0 || cost > STRATAGEM_CP_MAX) return refuse('invalid-amount', 'that is not a possible cost')
  if (player.cp < cost) return refuse('not-enough-cp', 'not enough command points')
  if (missed && fewestCpSince(state, player, missed) < cost)
    return refuse('not-enough-cp', 'that would leave too few command points at a later moment')
  if (limitReached(state, player, stratagem, moment))
    return refuse(
      'stratagem-limit',
      `${stratagem.name} has been used ${stratagem.limit === 'battle' ? 'this' : when} ${stratagem.limit.replace('-', ' ')}`,
    )
  return null
}

function applyStratagemUse(state: BattleState, player: PlayerState, stratagem: Stratagem, overriddenCost?: number, missed?: BattleMoment) {
  const spent = overriddenCost ?? stratagem.cp
  player.cp -= spent
  player.cpSpent += spent
  recordCpChange(state, player, -spent, missed)
  const moment = missed ?? { round: state.round, phase: state.phase, turn: state.activePlayerId }
  player.uses.push({ key: stratagem.key, name: stratagem.name, cp: spent, round: moment.round, phase: moment.phase, turn: moment.turn })
}

/** The fewest CP the side held from the end of a moment until now, which a missed spend may not exceed. */
function fewestCpSince(state: BattleState, player: PlayerState, moment: BattleMoment): number {
  const from = momentOrder(state, moment)
  return Object.entries(player.cpByMoment).reduce((fewest, [key, cp]) => {
    const order = Number(key)
    return order < from ? fewest : Math.min(fewest, order === from ? cp.last : cp.fewest)
  }, player.cp)
}

/** A gain beyond the side's own Command phase, which the rules cap at one a battle round. */
function bonusCpRefusal(player: PlayerState, round: number, delta: number): Refusal | null {
  return (player.bonusCpByRound[round - 1] ?? 0) + delta > 1
    ? refuse('cp-gain-limit', 'a side can gain at most 1 additional command point per battle round')
    : null
}

function adjustCp(state: BattleState, player: PlayerState, delta: number, missed?: BattleMoment) {
  const round = missed?.round ?? state.round
  player.cp += delta
  if (delta > 0) {
    player.cpGained += delta
    player.bonusCpByRound[round - 1] = (player.bonusCpByRound[round - 1] ?? 0) + delta
  } else player.cpSpent += Math.abs(delta)
  recordCpChange(state, player, delta, missed)
}

/** Carries a CP change through every moment since the one it belongs to. */
function recordCpChange(state: BattleState, player: PlayerState, delta: number, missed?: BattleMoment) {
  if (missed) {
    const from = momentOrder(state, missed)
    for (const [key, cp] of Object.entries(player.cpByMoment)) {
      if (Number(key) >= from) player.cpByMoment[Number(key)] = { fewest: cp.fewest + delta, last: cp.last + delta }
    }
    for (let round = missed.round; round < state.round; round++) player.cpByRound[round - 1]! += delta
  }
  player.cpByRound[state.round - 1] = player.cp
}

/** The round a settlement's points belong to. */
export function pointsRound(state: BattleState, command: Extract<Command, { kind: 'score-settlement' }>): number {
  return command.missed?.round ?? command.round ?? state.round
}

type ReportedFrom = {
  status: BattleState['status']
  activePlayerId: PlayerId | null
  seats: Pick<PlayerState, 'primary' | 'secondary' | 'painted'>[]
}

/** The score stands alone: it replaces what was tracked and earns no battle-ready bonus on top. */
function reportResult(state: BattleState, vp: Record<PlayerId, number>) {
  state.beforeReport = {
    status: state.status,
    activePlayerId: state.activePlayerId,
    seats: state.players.map(({ primary, secondary, painted }) => ({ primary, secondary, painted })),
  }
  for (const player of state.players) Object.assign(player, { primary: vp[player.id]!, secondary: 0, painted: false })
  finishBattle(state, { reason: 'reported', concededBy: null })
}

function reopenBattle(state: BattleState) {
  if (state.beforeReport) {
    const { status, activePlayerId, seats } = state.beforeReport
    for (const [at, player] of state.players.entries()) Object.assign(player, seats[at])
    state.status = status
    state.activePlayerId = activePlayerId
    state.result = null
    state.beforeReport = null
    return
  }
  state.advanceRequested = false
  state.scoringAcknowledged = false
  state.completionPending = false
  state.status = 'playing'
  state.result = null
  state.activePlayerId = state.resumePlayerId ?? state.firstPlayerId
  state.clockPaused = false
}

/** Ends the battle, remembering whose turn it was so reopening it resumes there. */
function finishBattle(state: BattleState, result: NonNullable<BattleState['result']>) {
  state.status = 'finished'
  state.result = result
  state.resumePlayerId = state.activePlayerId
  state.activePlayerId = null
  state.clockSide = null
}

/** The side whose clock runs while the battle is in play, or null outside play. */
export function clockSide(state: BattleState): number | null {
  if (state.status !== 'playing' || state.completionPending) return null
  return state.clockSide ?? state.players.find((candidate) => candidate.id === state.activePlayerId)?.side ?? null
}

/** Puts a card into the hand as the side's own deck holds it, and returns its key. */
function drawCard(state: BattleState, player: PlayerState, card: Secondary, seq: number): string {
  const secondary = { ...(player.secondaryDeck?.find((candidate) => candidate.key === card.key) ?? card) }
  player.secondaries.push(secondary)
  player.secondaryDrawSeq[secondary.key] = seq
  const now = playedMoment(state)
  if (now) player.secondaryDrawnAt[secondary.key] = momentOrder(state, now)
  player.secondaryStatus = { ...player.secondaryStatus, [secondary.key]: 'active' }
  return secondary.key
}

function enterTurn(state: BattleState, playerId: PlayerId, settlementRound: number | null, seq: number) {
  state.activePlayerId = playerId
  state.turnSeq = seq
  state.phase = 'command'
  const activeSide = state.players.find((candidate) => candidate.id === playerId)?.side
  const player = activeSide === undefined ? undefined : sideCaptain(state, activeSide)
  if (player) {
    for (const saved of player.missionSelections) {
      if (saved.selection.kind === 'punishment' || saved.selection.kind === 'guards') saved.expired = true
    }
    state.pendingSettlement = settlementRound === null || state.settings.manual ? null : { playerId: player.id, round: settlementRound }
    state.drawAcknowledged = false
    for (const side of state.settings.manual ? [] : new Set(state.players.map((candidate) => candidate.side))) {
      const resources = sideCaptain(state, side)
      resources.cp += COMMAND_PHASE_CP
      resources.cpGained += COMMAND_PHASE_CP
      resources.cpByRound[state.round - 1] = resources.cp
    }
    player.secondariesDrawnThisTurn = []
    player.additionalSecondaryDrawsThisTurn = 0
    player.secondariesToReview = []
  }
}

function inferBattleSize(state: BattleState) {
  if (!state.settings.sizeFromRosters || state.status !== 'setup') return
  state.settings.limit = rosterBattleFormat(state).limit
}

function validatePrep(prep: BattlePrep): Refusal | null {
  if (prep.stratagems.length > STRATAGEMS_MAX) return refuse('invalid-prep', `that is more than ${STRATAGEMS_MAX} stratagems`)
  if (prep.stratagems.some((stratagem) => !stratagem.name.trim())) return refuse('invalid-prep', 'name every stratagem')
  if (prep.stratagems.some((stratagem) => stratagem.cp < 0 || stratagem.cp > STRATAGEM_CP_MAX)) {
    return refuse('invalid-prep', `a stratagem costs between 0 and ${STRATAGEM_CP_MAX} command points`)
  }
  if (prep.secondaries.length > FIXED_SECONDARIES) return refuse('invalid-prep', `that is more than ${FIXED_SECONDARIES} secondaries`)
  if (prep.secondaries.some((secondary) => !secondary.name.trim())) return refuse('invalid-prep', 'name every secondary')
  if (new Set(prep.secondaries.map((secondary) => secondary.key)).size !== prep.secondaries.length) {
    return refuse('invalid-prep', 'the selected secondaries contain duplicates')
  }
  if ((prep.secondaryDeck?.length ?? 0) > SECONDARY_DECK_MAX) return refuse('invalid-prep', 'that secondary deck is too large')
  if (prep.secondaryDeck?.some((secondary) => !secondary.name.trim())) return refuse('invalid-prep', 'name every secondary in the deck')
  if (prep.secondaryDeck && new Set(prep.secondaryDeck.map((secondary) => secondary.key)).size !== prep.secondaryDeck.length) {
    return refuse('invalid-prep', 'the secondary deck contains duplicates')
  }
  if (prep.secondaryMode === 'tactical' && !prep.secondaryDeck?.length) return refuse('invalid-prep', 'choose a tactical secondary deck')
  if (
    prep.secondaryDeck &&
    prep.secondaries.some((secondary) => !prep.secondaryDeck?.some((candidate) => candidate.key === secondary.key))
  ) {
    return refuse('invalid-prep', 'a selected secondary is not in the deck')
  }
  if (prep.primary && !prep.primary.name.trim()) return refuse('invalid-prep', 'name the primary mission')
  return null
}
