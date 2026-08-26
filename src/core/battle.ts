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
import type { UnitGroup } from './unitGroups'
import type { RosterPick } from './roster'

/** The phases of a battle round, in the order 11th edition plays them. */
export const PHASES = ['command', 'movement', 'shooting', 'charge', 'fight', 'end'] as const

export type Phase = (typeof PHASES)[number]

export const BATTLE_ROUNDS = 5

/** Granted once, to the player entering their own command phase. */
const COMMAND_PHASE_CP = 1

const PLAYERS_PER_BATTLE = 2
const TEAM_BATTLE_PLAYERS = 3
export const ROSTER_NAME_MAX_LENGTH = 80

/** How many detachments one army may field, and so how many names a pooled card may name. */
export const DETACHMENTS_MAX = 3

/**
 * The longest label naming where a stratagem came from.
 *
 * An army fielding several detachments names them together, so this is what those
 * names join to — bounding it at one name refused the pool outright, and a refused
 * pool is a side playing with no stratagems at all.
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
  built?: BuiltRoster
}

/**
 * What the catalogue said about the list at the moment it was attached.
 *
 * The expansion the price came from is deliberately not here. Nothing reads it —
 * the fold keeps `units`, the opponent reads `text`, and `id` points back at the
 * saved list — so carrying it made every read of every log parse a selection tree
 * on behalf of no one.
 */
type BuiltRoster = {
  catalogueId: string
  /** The catalogue revision this list was priced and validated against. */
  revision: string
  /** The game size agreed for the battle, so both players see the same ceiling. */
  limit: number
  /** Named for display, since an opponent's device may have no catalogue loaded. */
  detachment: string | null
  /** Ordered detachment purchases. */
  detachments?: { name: string; points: number | null }[]
  /** The 11th-edition detachment-point allowance for this battle size. */
  detachmentPointBudget?: number | null
  /** The chosen force disposition; the pair decides the mission. */
  disposition: string | null
  /** Frozen selections let a battle roster open the same applied datasheets as a shared roster. */
  detachmentIds?: string[]
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

type SubmittedUnit = {
  key: string
  name: string
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
}

export const UNIT_FORMATIONS = ['battlefield', 'strategic-reserves', 'deep-strike', 'embarked'] as const
export type UnitFormation = (typeof UNIT_FORMATIONS)[number]

/** A unit's standing in the battle. Attached rosters begin on the battlefield. */
export type UnitState = SubmittedUnit & {
  destroyed: boolean
  deployed: boolean
  formation: UnitFormation
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

/** What is left of a unit, in wounds, which is the one number both halves fold to. */
export function unitWoundsLeft(unit: UnitState): number | null {
  return unit.wounds ? unit.alive * unit.wounds - unit.damage : null
}

/**
 * A stratagem as the player transcribes it from their own book.
 *
 * None of this is in the community catalogue data — a detachment there carries its
 * rule and its objective, and nothing about stratagems — so the content comes from
 * the player and is saved with their list. What this file owns is the part worth
 * automating: what it costs, and how often it may be used.
 */
export type Stratagem = {
  key: string
  name: string
  cp: number
  limit: StratagemLimit
  phases?: Phase[]
  turn?: 'your-turn' | 'opponent-turn' | 'either'
  /**
   * The detachment that prints it, where one does. Recorded because a side of allies
   * pools two detachments and their rules do not pool with them — each ally's
   * detachment affects their own army and the enemy, never their ally's — so the
   * pool has to be able to say which of them a card came from. Absent on a core
   * stratagem, and on every pool written before this was recorded.
   */
  detachment?: string
}

/** How often a stratagem may be used. `phase` and `turn` reset; `battle` does not. */
export type StratagemLimit = 'phase' | 'turn' | 'battle' | 'unlimited'

export const STRATAGEM_LIMITS: StratagemLimit[] = ['phase', 'turn', 'battle', 'unlimited']

/**
 * The last section of setup, which is what a `set-setup-step` may name.
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
export type Secondary = { key: string; name: string }
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
const SECONDARY_HISTORY_MAX = 30

/**
 * Fixed secondaries are chosen once and scored all game; tactical ones are drawn as
 * play goes on. A card's payouts differ between the two, so the battle records which
 * is being played.
 */
export type SecondaryMode = 'fixed' | 'tactical'

export const SECONDARY_MODES: SecondaryMode[] = ['fixed', 'tactical']
/** How many tactical cards a side draws at the top of each of its own turns. Unresolved cards from earlier turns are kept alongside them, not replaced. */
export const TACTICAL_HAND_SIZE = 2

type BattlePrep = {
  stratagems: Stratagem[]
  secondaries: Secondary[]
  secondaryDeck?: Secondary[]
  primary: Secondary | null
  secondaryMode: SecondaryMode
}

export type BattleEndReason = 'completed' | 'finished-early' | 'conceded'

export type BattleSettings = {
  limit: number | null
  missionPackId: string | null
  terrainLayoutId: string | null
  twistId: string | null
  teamBattle: boolean
  playerCount: 2 | 3 | 4
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
  const seated = state.players.filter((player) => player.side === side)
  return seated.length && seated.every((player) => player.painted) ? PAINTED_ARMY_POINTS : 0
}

/** The matched-play game sizes, smallest first. */
const KOTC_LIMITS = [500, 600] as const
const KOTC_ROUNDS = 3
export const DEFAULT_GAME_LIMIT = 2000

export const GAME_SIZES = [
  ...KOTC_LIMITS.map((limit) => ({ name: `King of the Colosseum (${limit})`, limit, detachmentPoints: null })),
  { name: 'Incursion', limit: 1000, detachmentPoints: 2 },
  { name: 'Strike Force', limit: 2000, detachmentPoints: 3 },
  { name: 'Onslaught', limit: 3000, detachmentPoints: null },
] as const

export const detachmentPointBudget = (limit: number) => GAME_SIZES.find((size) => size.limit === limit)?.detachmentPoints ?? null
export const isKotcLimit = (limit: number | null): boolean => limit !== null && KOTC_LIMITS.some((candidate) => candidate === limit)
export const detachmentLimit = (limit: number) => (isKotcLimit(limit) ? 1 : 3)
export const battleRoundLimit = (limit: number | null) => (isKotcLimit(limit) ? KOTC_ROUNDS : BATTLE_ROUNDS)

/** The format-specific cap for copies of one datasheet, before catalogue limits are applied. */
export const formatDatasheetLimit = (limit: number, repeatable: boolean) => (isKotcLimit(limit) ? (repeatable ? 2 : 1) : null)

const hasUnitKeyword = (keywords: readonly string[], wanted: string) =>
  keywords.some((keyword) => keyword.trim().toLocaleLowerCase() === wanted)

export const kotcDatasheetRepeatable = (keywords: readonly string[]) =>
  hasUnitKeyword(keywords, 'battleline') || hasUnitKeyword(keywords, 'dedicated transport')

export function kotcUnitExclusions(unit: { keywords: readonly string[]; toughness: number | null }): string[] {
  return [
    ...(hasUnitKeyword(unit.keywords, 'epic hero') ? ['does not allow Epic Heroes'] : []),
    ...(unit.toughness !== null && unit.toughness > 9 ? [`does not allow Toughness ${unit.toughness}`] : []),
  ]
}

export function detachmentPointsError(detachments: readonly { points: number | null }[], allowance: number | null): string | null {
  if (detachments.length <= 1 || allowance === null) return null
  const spent = detachments.reduce((total, detachment) => total + (detachment.points ?? 0), 0)
  return spent > allowance
    ? `This combination costs ${spent} DP; multiple detachments at this battle size may cost at most ${allowance} DP.`
    : null
}

type OnBehalfOf = { playerId?: PlayerId }

export type Command =
  | {
      kind: 'configure-battle'
      limit: number
      missionPackId: string | null
      terrainLayoutId: string | null
      twistId: string | null
      teamBattle?: boolean
      playerCount?: 2 | 3 | 4
      clockLimitMinutes: number | null
    }
  | { kind: 'reset-setup' }
  | { kind: 'set-setup-step'; step: number }
  | { kind: 'set-attacker'; attackerId: PlayerId }
  | { kind: 'set-first-turn'; firstPlayerId: PlayerId }
  | { kind: 'set-side-disposition'; side: number; disposition: string }
  | ({ kind: 'attach-roster'; roster: Roster; prep?: BattlePrep | null; painted?: boolean } & OnBehalfOf)
  | ({ kind: 'detach-roster' } & OnBehalfOf)
  | { kind: 'lock-league-rosters'; leagueToken: string; eventToken?: string }
  | ({ kind: 'set-unit'; unitKey: string; destroyed: boolean } & OnBehalfOf)
  | ({ kind: 'wound-unit'; unitKey: string; delta: number } & OnBehalfOf)
  /** `delta` is the change in wounds left, so a unit taking damage is negative, like models. */
  | ({ kind: 'damage-unit'; unitKey: string; delta: number } & OnBehalfOf)
  | ({ kind: 'deploy-unit'; unitKey: string; deployed: boolean } & OnBehalfOf)
  | ({ kind: 'set-unit-formation'; unitKey: string; formation: UnitFormation } & OnBehalfOf)
  | ({ kind: 'set-painted'; painted: boolean } & OnBehalfOf)
  | { kind: 'set-deployment'; patternId: string | null }
  | { kind: 'set-battlefield'; patternId: string; terrainLayoutId: string }
  | ({
      kind: 'set-prep'
      stratagems: Stratagem[]
      secondaries: Secondary[]
      secondaryDeck?: Secondary[]
      primary: Secondary | null
      secondaryMode: SecondaryMode
    } & OnBehalfOf)
  /** `cp` overrides the printed cost, for the stratagems whose price depends on the board. */
  | ({ kind: 'use-stratagem'; key: string; cp?: number } & OnBehalfOf)
  | ({ kind: 'score-secondary'; key: string; delta: number } & OnBehalfOf)
  | ({
      kind: 'score-settlement'
      scores: ({ category: 'primary'; delta: number } | { category: 'secondary'; key: string; delta: number; status?: 'achieved' })[]
      /**
       * The battle round these points belong to, when a turn that has already ended
       * owed them. Absent means the round being played, which is what the settlement
       * of the current turn always means and what every log written before this
       * field existed meant.
       */
      round?: number
    } & OnBehalfOf)
  | ({ kind: 'set-secondary-status'; key: string; status: SecondaryStatus } & OnBehalfOf)
  | ({ kind: 'draw-secondary'; secondary: Secondary } & OnBehalfOf)
  | ({ kind: 'draw-secondaries'; secondaries: Secondary[]; selected?: true } & OnBehalfOf)
  | ({ kind: 'acknowledge-draw' } & OnBehalfOf)
  | ({ kind: 'acknowledge-scoring' } & OnBehalfOf)
  | ({ kind: 'select-secret'; secondary: Secondary } & OnBehalfOf)
  | ({ kind: 'reveal-secret' } & OnBehalfOf)
  | { kind: 'begin-battle'; firstPlayerId: PlayerId; attackerId?: PlayerId }
  | ({ kind: 'adjust-cp'; delta: number } & OnBehalfOf)
  | ({ kind: 'resolve-tactical-hand'; keys?: string[]; gainCp?: boolean } & OnBehalfOf)
  | ({ kind: 'score'; category: 'primary' | 'secondary'; delta: number } & OnBehalfOf)
  | { kind: 'correct-player'; playerId: PlayerId; resource: 'cp' | 'primary' | 'secondary'; delta: number }
  | { kind: 'settle-opponent-turn' }
  | ({ kind: 'request-advance' } & OnBehalfOf)
  | ({ kind: 'cancel-advance' } & OnBehalfOf)
  | ({ kind: 'advance' } & OnBehalfOf)
  | { kind: 'pause-clock' }
  | { kind: 'resume-clock' }
  | { kind: 'end-battle'; reason?: BattleEndReason; concededBy?: PlayerId }
  | { kind: 'reopen-battle' }
  | { kind: 'undo'; target: number }

/** `stale` carries the sequence the caller should have had; `refused` carries the domain reason. */
export type SubmitResult = { outcome: 'appended'; seq: number } | { outcome: 'stale'; seq: number } | { outcome: 'refused'; reason: string }

export type LoggedCommand = { seq: number; by: PlayerId; at: number; command: Command }

export type PlayerState = {
  id: PlayerId
  side: number
  cp: number
  cpGained: number
  cpSpent: number
  cpByRound: number[]
  /** Additional rules-limited gains, excluding the command-phase grant and corrections. */
  bonusCpByRound: number[]
  primary: number
  secondary: number
  roster: Roster | null
  /** Empty for a pasted list: nothing there names the units. */
  units: UnitState[]
  stratagems: Stratagem[]
  /** Every use, with when it happened, so a limit can be judged against the log. */
  uses: StratagemUse[]
  secondaries: Secondary[]
  /** Cards drawn since this side's turn began, reset when it begins again. A card kept from an earlier turn does not count against it. */
  /**
   * The cards this side's current turn has dealt, in the order they came off the deck.
   *
   * The keys and not a tally, because a card may only be put back the moment it is
   * drawn: a hand carries unscored cards from turn to turn, and a count cannot tell
   * the two apart. It is also what says which draw a card put back was using, so
   * putting one back frees the slot it took rather than any slot at all.
   */
  secondariesDrawnThisTurn: string[]
  /** This side's primary mission for its ordered disposition matchup. */
  primaryCard: Secondary | null
  secondaryMode: SecondaryMode
  secondaryDeck: Secondary[] | null
  /** What each named secondary has scored, keyed the same way. */
  scored: Record<string, number>
  /** Per-round ledgers are folded from score commands, never stored separately. */
  primaryByRound: number[]
  secondaryByRound: number[]
  scoredByRound: Record<string, number[]>
  secondaryStatus: Record<string, SecondaryStatus>
  secretSecondary: string | null
  secretRevealed: boolean
  painted: boolean
  corrections: { cp: number; primary: number; secondary: number }
  correctionByRound: { primary: number[]; secondary: number[] }
}

type StratagemUse = { key: string; round: number; phase: Phase; turn: PlayerId | null }

export type BattleState = {
  status: 'setup' | 'playing' | 'finished'
  /** The shared setup section shown on every seated device. */
  setupStep: number
  /** 0 during setup, then 1 through `BATTLE_ROUNDS`. */
  round: number
  phase: Phase
  activePlayerId: PlayerId | null
  firstPlayerId: PlayerId | null
  attackerId: PlayerId | null
  /**
   * The Force Disposition each side plays, where its armies brought more than one.
   *
   * A side of allies fields one army between them and plays one card, chosen from
   * those either of them brought. A side that brought only one has nothing to record
   * here, which is why this is empty for every duel.
   */
  sideDispositions: Record<number, string>
  resumePlayerId: PlayerId | null
  pendingSettlement: { playerId: PlayerId; round: number } | null
  advanceRequested: boolean
  scoringAcknowledged: boolean
  drawAcknowledged: boolean
  /** The battlefield both players are using. Shared, so either may set it. */
  deploymentId: string | null
  leagueToken: string | null
  leagueEventToken: string | null
  settings: BattleSettings
  result: { reason: BattleEndReason; concededBy: PlayerId | null } | null
  players: PlayerState[]
  turns: { playerId: PlayerId; round: number; startedAt: number; endedAt: number | null }[]
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
/**
 * How many players a battle seats.
 *
 * Its own settings decide it, and only here, so a third player following the link
 * is refused by the same rule the interface reads rather than by a separate one
 * that could come to disagree.
 */
export function battleCapacity(settings: { teamBattle?: boolean; playerCount?: 2 | 3 | 4 }) {
  return settings.playerCount ?? (settings.teamBattle ? TEAM_BATTLE_PLAYERS : PLAYERS_PER_BATTLE)
}

export function reduceBattle(playerIds: readonly PlayerId[], log: readonly LoggedCommand[], playerSides?: readonly number[]): BattleState {
  const state = emptyBattle(playerIds, playerSides)
  for (const _step of replay(state, log)) {
    // The fold is the point; every step is already applied to `state`.
  }
  return state
}

/** One command as it actually happened, and what the fold knew either side of it. */
export type BattleStep = {
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
    apply(state, entry.by, entry.command)
    recordProgress(state, entry, before)
    const actor = state.players.find((candidate) => candidate.id === entry.by)
    const targetId = 'playerId' in entry.command && entry.command.playerId ? entry.command.playerId : entry.by
    yield {
      entry,
      before,
      army: actor ? targetArmy(state, actor, entry.command) : state.players.find((candidate) => candidate.id === targetId),
    }
  }
}

/** The clock and the undo target, both of which follow from the command rather than from the rules. */
function recordProgress(state: BattleState, entry: LoggedCommand, before: BattleStep['before']) {
  const openTurn = (at: number) => {
    if (state.activePlayerId) state.turns.push({ playerId: state.activePlayerId, round: state.round, startedAt: at, endedAt: null })
  }
  const closeTurn = (at: number) => {
    const current = state.turns.at(-1)
    if (current) current.endedAt = at
  }

  if (entry.command.kind === 'begin-battle') openTurn(entry.at)
  else if (entry.command.kind === 'advance' && (state.activePlayerId !== before.active || state.round !== before.round)) {
    closeTurn(entry.at)
    openTurn(entry.at)
  } else if (entry.command.kind === 'end-battle') closeTurn(entry.at)
  else if (entry.command.kind === 'reopen-battle') openTurn(entry.at)

  if (entry.command.kind === 'begin-battle' || entry.command.kind === 'lock-league-rosters') state.undoable = null
  else if (
    !['settle-opponent-turn', 'request-advance', 'cancel-advance', 'acknowledge-draw', 'acknowledge-scoring'].includes(entry.command.kind)
  ) {
    state.undoable = { seq: entry.seq, by: entry.by, kind: entry.command.kind }
  }
}

/** A battle before anything has happened in it, which is what a replay folds into. */
export function emptyBattle(playerIds: readonly PlayerId[], playerSides?: readonly number[]): BattleState {
  return {
    status: 'setup',
    setupStep: 0,
    round: 0,
    phase: 'command',
    activePlayerId: null,
    firstPlayerId: null,
    attackerId: null,
    sideDispositions: {},
    resumePlayerId: null,
    pendingSettlement: null,
    advanceRequested: false,
    scoringAcknowledged: false,
    drawAcknowledged: false,
    deploymentId: null,
    leagueToken: null,
    leagueEventToken: null,
    settings: { ...DEFAULT_SETTINGS },
    result: null,
    players: playerIds.map((id, index) => ({
      id,
      side: playerSides?.[index] ?? index,
      cp: 0,
      cpGained: 0,
      cpSpent: 0,
      cpByRound: Array(BATTLE_ROUNDS).fill(0),
      bonusCpByRound: Array(BATTLE_ROUNDS).fill(0),
      primary: 0,
      secondary: 0,
      roster: null,
      units: [],
      stratagems: [],
      uses: [],
      secondaries: [],
      secondariesDrawnThisTurn: [],
      primaryCard: null,
      secondaryMode: 'tactical',
      secondaryDeck: null,
      scored: {},
      primaryByRound: Array(BATTLE_ROUNDS).fill(0),
      secondaryByRound: Array(BATTLE_ROUNDS).fill(0),
      scoredByRound: {},
      secondaryStatus: {},
      secretSecondary: null,
      secretRevealed: false,
      painted: false,
      corrections: { cp: 0, primary: 0, secondary: 0 },
      correctionByRound: { primary: Array(BATTLE_ROUNDS).fill(0), secondary: Array(BATTLE_ROUNDS).fill(0) },
    })),
    undoable: null,
    seq: 0,
    turns: [],
  }
}

/**
 * Why `by` may not run `command` against `state`, or null when they may.
 *
 * Every rule about turn order, ownership and legality lives here. The server
 * calls it before appending; the UI calls it to decide what to render enabled.
 */
export function validate(state: BattleState, by: PlayerId, command: Command): string | null {
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor) return 'you are not in this battle'
  if ('playerId' in command && command.playerId && !state.players.some((candidate) => candidate.id === command.playerId)) {
    return 'that player is not in this battle'
  }
  const player = targetArmy(state, actor, command)

  switch (command.kind) {
    case 'configure-battle': {
      if (state.status !== 'setup') return 'the battle has started'
      if (state.leagueToken && command.limit !== state.settings.limit) return 'league roster battle size is sealed'
      if (state.leagueToken && (command.teamBattle ?? false) !== state.settings.teamBattle) return 'league battle sides are sealed'
      if (state.leagueToken && battleCapacity(command) !== battleCapacity(state.settings)) return 'league battle seats are sealed'
      if (command.playerCount !== undefined && command.playerCount !== 2 && command.playerCount !== 3 && command.playerCount !== 4)
        return 'choose a supported player count'
      if (battleCapacity(command) > PLAYERS_PER_BATTLE !== Boolean(command.teamBattle)) return 'choose matching battle sides and seats'
      if (battleCapacity(command) < state.players.length) return 'choose enough seats for every player'
      if (!GAME_SIZES.some((size) => size.limit === command.limit)) return 'choose a supported battle size'
      return null
    }
    case 'reset-setup':
      if (state.leagueToken) return 'league rosters are sealed'
      return state.status === 'setup' ? null : 'the battle has started'
    case 'set-setup-step':
      if (state.status !== 'setup') return 'the battle has started'
      return Number.isInteger(command.step) && command.step >= 0 && command.step <= SETUP_STEP_MAX ? null : 'choose a setup section'
    case 'set-attacker':
      if (state.status !== 'setup') return 'the battle has started'
      return state.players.some((candidate) => candidate.id === command.attackerId) ? null : 'that attacker is not in this battle'
    case 'set-first-turn':
      if (state.status !== 'setup') return 'the battle has started'
      return state.players.some((candidate) => candidate.id === command.firstPlayerId) ? null : 'that player is not in this battle'
    case 'set-side-disposition': {
      if (state.status !== 'setup') return 'the battle has started'
      // Only a card one of the side's own armies brought. The side chooses between
      // them; it does not get to play something nobody at the table wrote down.
      const brought = state.players.some(
        (candidate) => candidate.side === command.side && candidate.roster?.built?.disposition === command.disposition,
      )
      return brought ? null : 'that force disposition is not one this side brought'
    }
    case 'attach-roster': {
      if (state.leagueToken) return 'league rosters are sealed'
      if (state.status === 'finished') return 'the battle is over'
      // Correcting a list mid-battle stays allowed; bringing a different set of cards with it does not.
      if (state.status === 'playing' && command.prep) return 'cards are settled before the battle begins'
      const name = command.roster.name.trim()
      if (!name) return 'name your army'
      if (name.length > ROSTER_NAME_MAX_LENGTH) return 'that name is too long'
      if (!command.roster.text.trim()) return 'paste your list'
      if (command.roster.text.length > ROSTER_MAX_LENGTH) return 'that list is too long'
      const built = command.roster.built
      if (state.settings.limit !== null && built && built.limit !== rosterLimit(state, player))
        return 'that roster does not match the battle size'
      if (built?.detachmentPointBudget !== undefined) {
        const detachmentError = detachmentPointsError(built.detachments ?? [], built.detachmentPointBudget)
        if (detachmentError) return 'invalid detachment combination'
      }
      if (command.prep) {
        const prepError = validatePrep(command.prep)
        if (prepError) return prepError
      }
      return null
    }
    case 'detach-roster': {
      if (state.leagueToken) return 'league rosters are sealed'
      // Correcting a list mid-battle stays allowed, because a corrected list is still
      // an army. Taking one away is not: the units on the table would have nothing
      // behind them, so a seat is only emptied while the table is being set.
      if (state.status !== 'setup') return 'the battle has started'
      if (!player.roster) return 'that seat has no army'
      return null
    }
    case 'lock-league-rosters':
      if (state.status !== 'setup') return 'the battle has started'
      if (state.leagueToken) return 'league rosters are already sealed'
      return state.players.every((candidate) => candidate.roster) ? null : 'every player needs a sealed roster'
    case 'begin-battle': {
      if (state.status !== 'setup') return 'the battle has started'
      const requiredPlayers = battleCapacity(state.settings)
      if (state.players.length < requiredPlayers) return 'waiting for an opponent'
      if (state.players.length > requiredPlayers) return 'too many players are seated'
      const sideSizes = [...new Set(state.players.map((candidate) => candidate.side))].map(
        (side) => state.players.filter((candidate) => candidate.side === side).length,
      )
      if (
        sideSizes.length !== 2 ||
        (requiredPlayers === 2 && sideSizes.some((size) => size !== 1)) ||
        (requiredPlayers === 3 && sideSizes.toSorted((left, right) => left - right).join(',') !== '1,2') ||
        (requiredPlayers === 4 && sideSizes.some((size) => size !== 2))
      )
        return 'players must be seated on two valid sides'
      if (state.players.some((candidate) => !candidate.roster))
        return state.settings.teamBattle ? 'every army needs a list' : 'both armies need a list'
      if (!state.players.some((candidate) => candidate.id === command.firstPlayerId)) return 'that player is not in this battle'
      // A side of allies plays one Force Disposition, and it decides the primary each
      // side is set. Starting without it would hand the answer to whichever seat is first.
      if (
        state.players.some(
          (candidate) => sideDispositionChoices(state, candidate.side).length > 1 && !sideDisposition(state, candidate.side),
        )
      )
        return 'each side must choose the force disposition it plays'
      if (command.attackerId && !state.players.some((candidate) => candidate.id === command.attackerId))
        return 'that attacker is not in this battle'
      if (
        state.settings.limit !== null &&
        state.players.some((candidate) => candidate.roster?.built && candidate.roster.built.limit !== rosterLimit(state, candidate))
      ) {
        return 'every roster must match the battle size'
      }
      return null
    }
    case 'adjust-cp': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!Number.isInteger(command.delta) || command.delta === 0) return 'command points move in whole steps'
      if (player.cp + command.delta < 0) return 'not enough command points'
      if (command.delta > 0 && (player.bonusCpByRound[state.round - 1] ?? 0) + command.delta > 1) {
        return 'a side can gain at most 1 additional command point per battle round'
      }
      return null
    }
    case 'resolve-tactical-hand': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (state.phase !== 'end' || !sameSide(state, state.activePlayerId, player.id))
        return 'resolve tactical missions at the end of your turn'
      if (player.secondaryMode !== 'tactical') return 'only tactical secondaries are resolved each turn'
      const active = player.secondaries.filter(
        (secondary) => secondary.key !== player.secretSecondary && player.secondaryStatus[secondary.key] === 'active',
      )
      if (!active.length) return 'there are no active tactical secondaries to resolve'
      const keys = command.keys ?? []
      if (keys.some((key) => !active.some((secondary) => secondary.key === key))) return 'that secondary is not active'
      if (command.gainCp && !keys.length) return 'discard a secondary to gain a command point'
      if (command.gainCp && (player.bonusCpByRound[state.round - 1] ?? 0) >= 1) {
        return 'a side can gain at most 1 additional command point per battle round'
      }
      return null
    }
    case 'score': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!Number.isInteger(command.delta) || command.delta === 0) return 'victory points move in whole steps'
      if (player[command.category] + command.delta < 0) return 'that would go below zero'
      // Once secondaries are named, they are scored by name: two ways of adding to
      // the same total is how a breakdown stops adding up.
      if (command.category === 'secondary' && player.secondaries.length) return 'score the secondary by name'
      return null
    }
    case 'correct-player': {
      if (state.status === 'setup') return 'the battle has not started'
      const namedTarget = state.players.find((candidate) => candidate.id === command.playerId)
      if (!namedTarget) return 'that player is not in this battle'
      const target = sideCaptain(state, namedTarget.side)
      if (!Number.isInteger(command.delta) || command.delta === 0) return 'corrections move in whole steps'
      if (target[command.resource] + command.delta < 0) return 'that would go below zero'
      return null
    }
    case 'settle-opponent-turn': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!state.pendingSettlement) return 'there is no previous turn to settle'
      const target = state.players.find((candidate) => candidate.id === state.pendingSettlement?.playerId)
      if (
        target &&
        !sameSide(state, by, target.id) &&
        target.secretSecondary &&
        !target.secretRevealed &&
        target.secondaryStatus[target.secretSecondary] === 'active'
      ) {
        return 'the affected side has a hidden action to settle'
      }
      return null
    }
    case 'request-advance': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!sameSide(state, state.activePlayerId, player.id)) return 'it is not your turn'
      if (state.advanceRequested) return 'the phase is already waiting to advance'
      return null
    }
    case 'cancel-advance': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!sameSide(state, state.activePlayerId, player.id)) return 'it is not your turn'
      if (!state.advanceRequested) return 'the phase is not waiting to advance'
      return null
    }
    case 'acknowledge-scoring': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!sameSide(state, state.activePlayerId, player.id)) return 'it is not your turn'
      if (!state.advanceRequested) return 'the phase is not waiting for scoring'
      if (state.scoringAcknowledged) return 'scoring has already been reviewed'
      return null
    }
    case 'advance': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!sameSide(state, state.activePlayerId, player.id)) return 'it is not your turn'
      // What the active side still owes is a prompt, not a refusal. One person
      // refereeing for the table can do every one of those things on that side's
      // behalf, so refusing them the turn only stopped the game they were running.
      return null
    }
    case 'end-battle': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (command.reason === 'completed') return 'completed battles finish after the last turn'
      if (command.reason === 'conceded' && !command.concededBy) return 'choose who conceded'
      if (command.reason === 'conceded' && command.concededBy !== by) return 'you can only concede for yourself'
      if (command.reason !== 'conceded' && command.concededBy) return 'only a concession names a conceding player'
      return null
    }
    case 'reopen-battle':
      return state.status === 'finished' ? null : 'the battle is not over'
    case 'set-unit': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!player.units.some((unit) => unit.key === command.unitKey)) return 'that is not one of your units'
      return null
    }
    case 'deploy-unit': {
      if (state.status === 'finished') return 'the battle is over'
      if (!player.units.some((unit) => unit.key === command.unitKey)) return 'that is not one of your units'
      return null
    }
    case 'set-unit-formation': {
      if (state.status === 'finished') return 'the battle is over'
      const attached = attachedUnits(player.units, command.unitKey)
      if (!attached.length) return namesAnotherArmy(command, actor) ? 'that is not one of their units' : 'that is not one of your units'
      // Asked of the whole attached unit, because a deployment ability needs every
      // model in it: a character who can deep strike cannot take a bodyguard unit
      // that cannot with him.
      if (
        !['battlefield', 'strategic-reserves'].includes(command.formation) &&
        !attached.every((unit) => unit.formationOptions?.includes(command.formation))
      ) {
        return 'the roster data does not support that formation'
      }
      return null
    }
    // The bonus is for a painted army, which is settled before the battle and paid at the end of it.
    case 'set-painted':
      return state.status === 'setup' ? null : 'the battle ready bonus is set before the battle begins'
    case 'wound-unit': {
      if (state.status !== 'playing') return 'the battle is not running'
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return 'that is not one of your units'
      if (!Number.isInteger(command.delta) || command.delta === 0) return 'models come off in whole numbers'
      if (unit.alive + command.delta < 0) return 'there are not that many models left'
      if (unit.alive + command.delta > unit.models) return 'that is more models than the unit has'
      return null
    }
    case 'damage-unit': {
      if (state.status !== 'playing') return 'the battle is not running'
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return 'that is not one of your units'
      // Refused rather than guessed at: a unit whose models do not share a wounds
      // characteristic has no single number to count against, and inventing one
      // would put a squad's sergeant and his veterans on the same track.
      const left = unitWoundsLeft(unit)
      if (left === null || !unit.wounds) return 'the datasheet does not give this unit a single wounds characteristic'
      if (!Number.isInteger(command.delta) || command.delta === 0) return 'wounds come off in whole numbers'
      if (left + command.delta < 0) return 'there are not that many wounds left'
      if (left + command.delta > unit.models * unit.wounds) return 'that is more wounds than the unit has'
      return null
    }
    case 'set-deployment':
    case 'set-battlefield': {
      // The battlefield is shared, so either player may set it, and only before the
      // first turn — moving the deployment zones mid-battle is not a thing.
      if (state.status !== 'setup') return 'the battle has started'
      return null
    }
    case 'set-prep': {
      if (state.status === 'finished') return 'the battle is over'
      if (state.status === 'playing') {
        const missingTacticalDeck = player.secondaryMode === 'tactical' && !player.secondaryDeck?.length && player.secondaries.length === 0
        if (!missingTacticalDeck) return 'cards are settled before the battle begins'
        if (command.secondaryMode !== 'tactical' || command.secondaries.length) return 'cards are settled before the battle begins'
      }
      if (isKotcLimit(state.settings.limit) && command.secondaryMode !== 'tactical')
        return 'King of the Colosseum requires tactical secondaries'
      return validatePrep(command)
    }
    case 'use-stratagem': {
      if (state.status !== 'playing') return 'the battle is not running'
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.key)
      if (!stratagem) return 'that is not one of your stratagems'
      if (stratagem.phases?.length && !stratagem.phases.includes(state.phase)) return `${stratagem.name} cannot be used in this phase`
      if (stratagem.turn === 'your-turn' && !sameSide(state, state.activePlayerId, player.id))
        return `${stratagem.name} is used on your turn`
      if (stratagem.turn === 'opponent-turn' && sameSide(state, state.activePlayerId, player.id))
        return `${stratagem.name} is used on your opponent’s turn`
      const cost = command.cp ?? stratagem.cp
      if (!Number.isInteger(cost) || cost < 0 || cost > STRATAGEM_CP_MAX) return 'that is not a possible cost'
      if (player.cp < cost) return 'not enough command points'
      if (limitReached(player, stratagem, state)) return `${stratagem.name} has been used this ${stratagem.limit}`
      return null
    }
    case 'score-secondary': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!mayNameSecondary(state, by, player, command.key)) return 'that is not one of your secondaries'
      if (!Number.isInteger(command.delta) || command.delta === 0) return 'victory points move in whole steps'
      if ((player.scored[command.key] ?? 0) + command.delta < 0) return 'that would go below zero'
      return null
    }
    case 'score-settlement': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!command.scores.length) return 'record at least one score'
      // Naming a round is only ever answering the turn that is waiting to be settled.
      // Anything else is a second way to say which round a score belongs to.
      if (command.round !== undefined && command.round !== state.round) {
        const pending = state.pendingSettlement
        if (!pending || pending.playerId !== player.id || pending.round !== command.round) {
          return 'that is not the turn waiting to be settled'
        }
      }
      const keys = new Set<string>()
      for (const score of command.scores) {
        if (!Number.isInteger(score.delta) || score.delta <= 0) return 'victory points move in positive whole steps'
        if (score.category === 'primary') {
          if (keys.has('primary')) return 'record primary scoring once per settlement'
          keys.add('primary')
          continue
        }
        if (keys.has(score.key)) return 'record each secondary once per settlement'
        keys.add(score.key)
        if (!mayNameSecondary(state, by, player, score.key)) return 'that is not one of your secondaries'
      }
      return null
    }
    case 'set-secondary-status': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!mayNameSecondary(state, by, player, command.key)) return 'that is not one of your secondaries'
      return null
    }
    case 'draw-secondary': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (player.secondaryMode !== 'tactical') return 'only tactical missions are drawn'
      if (player.secondariesDrawnThisTurn.length >= TACTICAL_HAND_SIZE) {
        return 'you have already drawn your secondaries this turn'
      }
      if (!command.secondary.name.trim()) return 'name the secondary'
      if (player.secondaryDeck && !player.secondaryDeck.some((secondary) => secondary.key === command.secondary.key)) {
        return 'that secondary is not in your deck'
      }
      if (player.secondaries.some((secondary) => secondary.key === command.secondary.key)) return 'that secondary has already been drawn'
      if (player.secondaries.length >= SECONDARY_HISTORY_MAX) return 'the secondary history is full'
      return null
    }
    case 'draw-secondaries': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (player.secondaryMode !== 'tactical') return 'only tactical missions are drawn'
      const remaining = (player.secondaryDeck ?? []).filter(
        (candidate) => !player.secondaries.some((secondary) => secondary.key === candidate.key),
      ).length
      const refill = Math.min(
        TACTICAL_HAND_SIZE - player.secondariesDrawnThisTurn.length,
        remaining,
        SECONDARY_HISTORY_MAX - player.secondaries.length,
      )
      if (!command.secondaries.length || command.secondaries.length !== refill) return 'draw every card owed for this turn together'
      const keys = new Set<string>()
      for (const secondary of command.secondaries) {
        if (!secondary.name.trim()) return 'name the secondary'
        if (keys.has(secondary.key)) return 'draw each secondary once'
        keys.add(secondary.key)
        if (player.secondaryDeck && !player.secondaryDeck.some((candidate) => candidate.key === secondary.key)) {
          return 'that secondary is not in your deck'
        }
        if (player.secondaries.some((candidate) => candidate.key === secondary.key)) return 'that secondary has already been drawn'
      }
      if (player.secondaries.length + command.secondaries.length > SECONDARY_HISTORY_MAX) return 'the secondary history is full'
      return null
    }
    case 'acknowledge-draw': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!sameSide(state, state.activePlayerId, player.id)) return 'it is not your turn'
      if (sideOwes(state, player) === 'cards') return 'draw every card owed before taking the turn'
      if (!player.secondariesDrawnThisTurn.length) return 'there is no new hand to acknowledge'
      if (state.drawAcknowledged) return 'the hand has already been acknowledged'
      return null
    }
    case 'select-secret': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (player.secretSecondary) return 'you already have a secret mission'
      if (!command.secondary.name.trim()) return 'name the secret mission'
      if (player.secondaryDeck && !player.secondaryDeck.some((secondary) => secondary.key === command.secondary.key)) {
        return 'that secondary is not in your deck'
      }
      if (player.secondaries.some((secondary) => secondary.key === command.secondary.key)) return 'that secondary has already been selected'
      return null
    }
    case 'reveal-secret': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!player.secretSecondary) return 'you have no secret mission'
      if (player.secretRevealed) return 'the secret mission is already revealed'
      return null
    }
    case 'pause-clock': {
      return 'battle clocks are no longer supported'
    }
    case 'resume-clock': {
      return 'battle clocks are no longer supported'
    }
    case 'undo': {
      if (!state.undoable) return 'there is nothing to undo'
      if (state.undoable.seq !== command.target) return 'only the last action can be undone'
      return null
    }
    // A new command kind breaks this assignment rather than being quietly allowed.
    default: {
      const unhandled: never = command
      return `unknown command ${JSON.stringify(unhandled)}`
    }
  }
}

function apply(state: BattleState, by: PlayerId, command: Command) {
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor) return
  const player = targetArmy(state, actor, command)

  switch (command.kind) {
    case 'configure-battle': {
      const missionPackChanged = state.settings.missionPackId !== command.missionPackId
      state.settings = {
        limit: command.limit,
        missionPackId: command.missionPackId,
        terrainLayoutId: command.terrainLayoutId,
        twistId: command.twistId,
        teamBattle: command.teamBattle ?? false,
        playerCount: command.playerCount ?? (command.teamBattle ? TEAM_BATTLE_PLAYERS : PLAYERS_PER_BATTLE),
      }
      if (missionPackChanged) {
        state.deploymentId = null
        state.settings.terrainLayoutId = null
      }
      return
    }
    case 'reset-setup': {
      state.setupStep = 0
      state.attackerId = null
      state.firstPlayerId = null
      state.sideDispositions = {}
      state.deploymentId = null
      state.settings = { ...state.settings, terrainLayoutId: null, twistId: null }
      state.players.forEach(resetPlayer)
      return
    }
    case 'set-setup-step': {
      state.setupStep = command.step
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
     * asks for it and the section that starts the battle are two steps apart now:
     * a private answer would have let two devices show the table different ones.
     */
    case 'set-first-turn': {
      state.firstPlayerId = command.firstPlayerId
      return
    }
    case 'set-side-disposition': {
      state.sideDispositions[command.side] = command.disposition
      return
    }
    case 'attach-roster': {
      player.roster = { ...command.roster, name: command.roster.name.trim() }
      // A replaced list is a different army, so nothing about the old one survives.
      player.units = (command.roster.built?.units ?? []).map((unit) =>
        Object.assign({ destroyed: false, deployed: true, formation: 'battlefield' as const, alive: unit.models, damage: 0 }, unit),
      )
      if (command.prep !== undefined) applyPrep(player, command.prep)
      // Most armies on a table are painted, so a list arrives claiming the bonus and
      // the few that are not turn it off. Only when the command says so: a log from
      // before this carries no claim, and folding one must not invent it a bonus.
      if (command.painted !== undefined) player.painted = command.painted
      if (state.status === 'setup') {
        state.deploymentId = null
        state.settings.terrainLayoutId = null
      }
      return
    }
    case 'detach-roster': {
      player.roster = null
      player.units = []
      // The cards followed from the army, and the battlefield from both armies'
      // dispositions, so neither outlives the list they were derived from.
      applyPrep(player, null)
      state.deploymentId = null
      state.settings.terrainLayoutId = null
      return
    }
    case 'lock-league-rosters': {
      state.leagueToken = command.leagueToken
      state.leagueEventToken = command.eventToken ?? null
      return
    }
    case 'set-unit': {
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return
      unit.destroyed = command.destroyed
      // The three stay in step in both directions: a unit brought back is whole again,
      // and a unit that is gone has nothing left standing to be carrying a wound.
      unit.alive = command.destroyed ? 0 : unit.models
      unit.damage = 0
      return
    }
    case 'deploy-unit': {
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (unit) {
        unit.deployed = command.deployed
        unit.formation = command.deployed ? 'battlefield' : 'strategic-reserves'
      }
      return
    }
    case 'set-unit-formation': {
      // The character and the unit he joined start together, so one press moves both.
      for (const unit of attachedUnits(player.units, command.unitKey)) {
        unit.formation = command.formation
        unit.deployed = command.formation === 'battlefield'
      }
      return
    }
    case 'set-painted': {
      player.painted = command.painted
      return
    }
    case 'wound-unit': {
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return
      unit.alive += command.delta
      // The model that was carrying the damage is the one that just left, and a model
      // returning to the unit arrives whole, so either way nothing is still wounded.
      unit.damage = 0
      // Losing the last model is losing the unit: one event, not two states that
      // could contradict each other.
      unit.destroyed = unit.alive === 0
      return
    }
    case 'damage-unit': {
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      const left = unit ? unitWoundsLeft(unit) : null
      if (!unit || left === null || !unit.wounds) return
      /*
       * Wounds are the whole of it, and the models fall out of the arithmetic.
       *
       * Damage lands on one model until that model is gone and then moves to the next,
       * so what a unit has left is a single number of wounds and where the model line
       * falls inside it is division. Keeping the two as separate counters to be nudged
       * in step is how they end up disagreeing.
       */
      const remaining = left + command.delta
      unit.alive = Math.ceil(remaining / unit.wounds)
      unit.damage = unit.alive * unit.wounds - remaining
      unit.destroyed = unit.alive === 0
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
      applyPrep(player, command)
      if (state.status === 'playing' && sameSide(state, state.activePlayerId, player.id)) state.drawAcknowledged = false
      return
    }
    case 'use-stratagem': {
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.key)
      if (!stratagem) return
      const spent = command.cp ?? stratagem.cp
      player.cp -= spent
      player.cpSpent += spent
      player.cpByRound[state.round - 1] = player.cp
      player.uses.push({ key: stratagem.key, round: state.round, phase: state.phase, turn: state.activePlayerId })
      return
    }
    case 'score-secondary': {
      applySecondaryScore(player, command.key, command.delta, state.round)
      return
    }
    case 'score-settlement': {
      // A payout the previous turn owed belongs to the round that turn was in, which
      // the second player passing the turn has already moved the battle out of.
      const round = command.round ?? state.round
      for (const score of command.scores) {
        if (score.category === 'primary') {
          player.primary += score.delta
          player.primaryByRound[round - 1] = (player.primaryByRound[round - 1] ?? 0) + score.delta
          continue
        }
        applySecondaryScore(player, score.key, score.delta, round)
        if (score.status) {
          player.secondaryStatus = { ...player.secondaryStatus, [score.key]: score.status }
          if (score.key === player.secretSecondary) player.secretRevealed = true
        }
      }
      if (state.advanceRequested) state.scoringAcknowledged = true
      return
    }
    case 'set-secondary-status': {
      // A card put back or discarded the moment it is drawn is replaced, not spent: it
      // never occupied one of this turn's two draws, so the count backs off to let the
      // replacement in.
      const wasActive = (player.secondaryStatus[command.key] ?? 'active') === 'active'
      player.secondaryStatus = { ...player.secondaryStatus, [command.key]: command.status }
      if (command.key === player.secretSecondary && command.status !== 'active') player.secretRevealed = true
      if (wasActive && command.status !== 'active') {
        player.secondariesDrawnThisTurn = player.secondariesDrawnThisTurn.filter((key) => key !== command.key)
      }
      return
    }
    case 'draw-secondary': {
      const secondary = { ...(player.secondaryDeck?.find((candidate) => candidate.key === command.secondary.key) ?? command.secondary) }
      player.secondaries.push(secondary)
      player.secondaryStatus = { ...player.secondaryStatus, [secondary.key]: 'active' }
      player.secondariesDrawnThisTurn = [...player.secondariesDrawnThisTurn, secondary.key]
      state.drawAcknowledged = false
      return
    }
    case 'draw-secondaries': {
      for (const drawn of command.secondaries) {
        const secondary = { ...(player.secondaryDeck?.find((candidate) => candidate.key === drawn.key) ?? drawn) }
        player.secondaries.push(secondary)
        player.secondaryStatus = { ...player.secondaryStatus, [secondary.key]: 'active' }
      }
      player.secondariesDrawnThisTurn = [...player.secondariesDrawnThisTurn, ...command.secondaries.map((drawn) => drawn.key)]
      state.drawAcknowledged = false
      return
    }
    case 'acknowledge-draw': {
      state.drawAcknowledged = true
      return
    }
    case 'acknowledge-scoring': {
      state.scoringAcknowledged = true
      return
    }
    case 'select-secret': {
      const secondary = { ...(player.secondaryDeck?.find((candidate) => candidate.key === command.secondary.key) ?? command.secondary) }
      player.secondaries.push(secondary)
      player.secondaryStatus = { ...player.secondaryStatus, [secondary.key]: 'active' }
      player.secretSecondary = secondary.key
      player.secretRevealed = false
      return
    }
    case 'reveal-secret': {
      player.secretRevealed = true
      return
    }
    case 'begin-battle': {
      state.status = 'playing'
      state.round = 1
      state.firstPlayerId = command.firstPlayerId
      state.attackerId = command.attackerId ?? state.attackerId ?? command.firstPlayerId
      state.result = null
      enterTurn(state, command.firstPlayerId, null)
      return
    }
    case 'adjust-cp': {
      player.cp += command.delta
      if (command.delta > 0) {
        player.cpGained += command.delta
        player.bonusCpByRound[state.round - 1] = (player.bonusCpByRound[state.round - 1] ?? 0) + command.delta
      } else player.cpSpent += Math.abs(command.delta)
      player.cpByRound[state.round - 1] = player.cp
      return
    }
    case 'resolve-tactical-hand': {
      const keys = command.keys ?? []
      player.secondaryStatus = {
        ...player.secondaryStatus,
        ...Object.fromEntries(keys.map((key) => [key, 'discarded' as const])),
      }
      if (command.gainCp) {
        player.cp += 1
        player.cpGained += 1
        player.bonusCpByRound[state.round - 1] = (player.bonusCpByRound[state.round - 1] ?? 0) + 1
        player.cpByRound[state.round - 1] = player.cp
      }
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
        enterTurn(state, opponent.id, state.round)
        return
      }
      if (state.round === battleRoundLimit(state.settings.limit)) {
        state.status = 'finished'
        state.result = { reason: 'completed', concededBy: null }
        state.resumePlayerId = state.activePlayerId
        state.activePlayerId = null
        return
      }
      const endedRound = state.round
      state.round++
      if (state.firstPlayerId) {
        enterTurn(state, state.firstPlayerId, endedRound)
      }
      return
    }
    case 'end-battle': {
      state.advanceRequested = false
      state.scoringAcknowledged = false
      state.status = 'finished'
      state.result = { reason: command.reason ?? 'finished-early', concededBy: command.concededBy ?? null }
      state.resumePlayerId = state.activePlayerId
      state.activePlayerId = null
      return
    }
    case 'reopen-battle': {
      state.advanceRequested = false
      state.scoringAcknowledged = false
      state.status = 'playing'
      state.result = null
      state.activePlayerId = state.resumePlayerId ?? state.firstPlayerId
      return
    }
    case 'pause-clock': {
      return
    }
    case 'resume-clock': {
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

function resetPlayer(player: PlayerState) {
  player.cp = 0
  player.cpGained = 0
  player.cpSpent = 0
  player.cpByRound = Array(BATTLE_ROUNDS).fill(0)
  player.bonusCpByRound = Array(BATTLE_ROUNDS).fill(0)
  player.primary = 0
  player.secondary = 0
  player.roster = null
  player.units = []
  player.stratagems = []
  player.uses = []
  player.secondaries = []
  player.secondariesDrawnThisTurn = []
  player.secondaryDeck = null
  player.primaryCard = null
  player.secondaryMode = 'tactical'
  player.scored = {}
  player.primaryByRound = Array(BATTLE_ROUNDS).fill(0)
  player.secondaryByRound = Array(BATTLE_ROUNDS).fill(0)
  player.scoredByRound = {}
  player.secondaryStatus = {}
  player.secretSecondary = null
  player.secretRevealed = false
  player.painted = false
  player.corrections = { cp: 0, primary: 0, secondary: 0 }
  player.correctionByRound = { primary: Array(BATTLE_ROUNDS).fill(0), secondary: Array(BATTLE_ROUNDS).fill(0) }
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
  player.stratagems = chosen.stratagems.map((stratagem) => ({ ...stratagem, name: stratagem.name.trim() }))
  player.secondaries = chosen.secondaries.map((secondary) => ({
    ...(deck?.find((candidate) => candidate.key === secondary.key) ?? secondary),
    name: (deck?.find((candidate) => candidate.key === secondary.key)?.name ?? secondary.name).trim(),
  }))
  player.primaryCard = chosen.primary ? { ...chosen.primary, name: chosen.primary.name.trim() } : null
  player.secondaryMode = chosen.secondaryMode
  player.secondaryDeck = deck
  player.secondaryStatus = Object.fromEntries(player.secondaries.map((secondary) => [secondary.key, 'active']))
  player.secretSecondary = null
  player.secretRevealed = false
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

/** Whether a stratagem's allowance is spent for now. `turn` and `phase` reset as play moves on. */
function limitReached(player: PlayerState, stratagem: Stratagem, state: BattleState): boolean {
  if (stratagem.limit === 'unlimited') return false
  const uses = player.uses.filter((use) => use.key === stratagem.key)
  if (stratagem.limit === 'battle') return uses.length > 0
  const thisTurn = uses.filter((use) => use.round === state.round && use.turn === state.activePlayerId)
  return stratagem.limit === 'turn' ? thisTurn.length > 0 : thisTurn.some((use) => use.phase === state.phase)
}

function enterTurn(state: BattleState, playerId: PlayerId, settlementRound: number | null) {
  state.activePlayerId = playerId
  state.phase = 'command'
  const activeSide = state.players.find((candidate) => candidate.id === playerId)?.side
  const player = activeSide === undefined ? undefined : sideCaptain(state, activeSide)
  if (player) {
    state.pendingSettlement = settlementRound === null ? null : { playerId: player.id, round: settlementRound }
    state.drawAcknowledged = false
    player.cp += COMMAND_PHASE_CP
    player.cpGained += COMMAND_PHASE_CP
    player.cpByRound[state.round - 1] = player.cp
    player.secondariesDrawnThisTurn = []
  }
}

/**
 * The Force Disposition a side plays, which decides the primary it is set.
 *
 * One army fields one card. Where a side's armies agree, or where there is only one
 * of them, that is the answer and nothing has to be asked. Where two allies brought
 * different cards the side has to say which it plays, and until it does the answer
 * is nothing at all — taking the first seat's card would have played one ally's
 * choice for both of them without ever saying so.
 */
export function sideDisposition(state: BattleState, side: number): string | null {
  const brought = state.players.flatMap((player) =>
    player.side === side && player.roster?.built?.disposition ? [player.roster.built.disposition] : [],
  )
  const chosen = state.sideDispositions[side]
  if (chosen && brought.includes(chosen)) return chosen
  if (new Set(brought).size === 1) return brought[0] ?? null
  // A battle already being played is never left without a mission. Setup refuses to
  // start one until each side has said, so this only answers for battles begun before
  // the question was asked — and it answers what they were already being played on.
  return state.status === 'setup' ? null : (sideCaptain(state, side).roster?.built?.disposition ?? null)
}

/** The cards a side could play, which is what it is asked to choose between. */
export function sideDispositionChoices(state: BattleState, side: number): string[] {
  return [
    ...new Set(
      state.players.flatMap((player) =>
        player.side === side && player.roster?.built?.disposition ? [player.roster.built.disposition] : [],
      ),
    ),
  ]
}

export function sideCaptain(state: BattleState, side: number): PlayerState {
  return state.players.find((player) => player.side === side)!
}

/** Whether the command names an army other than the one recording it. */
function namesAnotherArmy(command: Command, actor: PlayerState): boolean {
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

/**
 * The army a command acts on, resolved for a caller outside this file.
 *
 * The server has to know which deck a draw comes off before it chooses the cards,
 * and that is this question: asking it a second way there would let the cards come
 * off one deck and be recorded against another.
 */
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
function targetArmy(state: BattleState, actor: PlayerState, command: Command): PlayerState {
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
): {
  side: number
  disposition: string | null
  primary: number
  secondary: number
  primaryByRound: number[]
  secondaryByRound: number[]
  /** How this side draws its cards, which is what says whether a fixed card's own ceiling applies. */
  secondaryMode: SecondaryMode
  /** What each named card has scored so far, keyed the way the card is named. */
  scored: Record<string, number>
} | null {
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor) return null
  const target = targetArmy(state, actor, command)
  return {
    side: target.side,
    disposition: sideDisposition(state, target.side),
    primary: target.primary,
    secondary: target.secondary,
    primaryByRound: target.primaryByRound,
    secondaryByRound: target.secondaryByRound,
    secondaryMode: target.secondaryMode,
    scored: target.scored,
  }
}

export function sameSide(state: BattleState, left: PlayerId | null, right: PlayerId): boolean {
  const leftSide = state.players.find((player) => player.id === left)?.side
  return leftSide !== undefined && leftSide === state.players.find((player) => player.id === right)?.side
}

function mayNameSecondary(state: BattleState, by: PlayerId, player: PlayerState, key: string): boolean {
  if (!player.secondaries.some((secondary) => secondary.key === key)) return false
  return mayNameCard(state, by, player, key)
}

/**
 * What the active side still owes before the turn moves on, or null.
 *
 * The same answer whoever asks. These used to refuse the turn to anyone but the
 * side itself, on the grounds that a helper's screen could not tell whether
 * private work remained — but drawing, putting a card back and discarding one are
 * all named in the log to both sides, so the only thing actually held back is a
 * card played face down. That is one opt-in card in fixed play, and it is the
 * only case left here that its own side has to answer.
 */
export function sideOwes(state: BattleState, player: PlayerState): 'settlement' | 'cards' | 'secret' | null {
  if (state.phase === 'command' && state.pendingSettlement?.playerId === player.id) return 'settlement'
  const hasUndrawnCard = player.secondaryDeck?.some((candidate) => !player.secondaries.some((secondary) => secondary.key === candidate.key))
  if (
    state.phase === 'command' &&
    player.secondaryMode === 'tactical' &&
    player.secondariesDrawnThisTurn.length < TACTICAL_HAND_SIZE &&
    hasUndrawnCard
  ) {
    return 'cards'
  }
  if (state.phase === 'end' && player.secretSecondary && !player.secretRevealed) return 'secret'
  return null
}

/** Whether a card may be named to this viewer, or is being held face down from them. */
export function mayNameCard(state: BattleState, viewerId: PlayerId | null, player: PlayerState, key: string): boolean {
  return player.secretSecondary !== key || player.secretRevealed || sameSide(state, viewerId, player.id)
}

function rosterLimit(state: BattleState, player: PlayerState): number | null {
  if (state.settings.limit === null || !state.settings.teamBattle) return state.settings.limit
  const teammates = state.players.filter((candidate) => candidate.side === player.side).length
  return state.settings.limit / teammates
}

function validatePrep(prep: BattlePrep): string | null {
  if (prep.stratagems.length > STRATAGEMS_MAX) return `that is more than ${STRATAGEMS_MAX} stratagems`
  if (prep.stratagems.some((stratagem) => !stratagem.name.trim())) return 'name every stratagem'
  if (prep.stratagems.some((stratagem) => stratagem.cp < 0 || stratagem.cp > STRATAGEM_CP_MAX)) {
    return `a stratagem costs between 0 and ${STRATAGEM_CP_MAX} command points`
  }
  if (prep.secondaries.length > FIXED_SECONDARIES) return `that is more than ${FIXED_SECONDARIES} secondaries`
  if (prep.secondaries.some((secondary) => !secondary.name.trim())) return 'name every secondary'
  if ((prep.secondaryDeck?.length ?? 0) > 60) return 'that secondary deck is too large'
  if (prep.secondaryDeck?.some((secondary) => !secondary.name.trim())) return 'name every secondary in the deck'
  if (prep.secondaryDeck && new Set(prep.secondaryDeck.map((secondary) => secondary.key)).size !== prep.secondaryDeck.length) {
    return 'the secondary deck contains duplicates'
  }
  if (prep.secondaryMode === 'tactical' && !prep.secondaryDeck?.length) return 'choose a tactical secondary deck'
  if (
    prep.secondaryDeck &&
    prep.secondaries.some((secondary) => !prep.secondaryDeck?.some((candidate) => candidate.key === secondary.key))
  ) {
    return 'a selected secondary is not in the deck'
  }
  if (prep.primary && !prep.primary.name.trim()) return 'name the primary mission'
  return null
}
