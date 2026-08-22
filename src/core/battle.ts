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

/** The phases of a battle round, in the order 11th edition plays them. */
export const PHASES = ['command', 'movement', 'shooting', 'charge', 'fight', 'end'] as const

export type Phase = (typeof PHASES)[number]

export const BATTLE_ROUNDS = 5

/** Granted once, to the player entering their own command phase. */
const COMMAND_PHASE_CP = 1

export const PLAYERS_PER_BATTLE = 2
export const TEAM_BATTLE_PLAYERS = 3
export const ROSTER_NAME_MAX_LENGTH = 80
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
  formationOptions?: UnitFormation[]
  prebattleRules?: ('infiltrators' | 'scouts')[]
}

export const UNIT_FORMATIONS = ['battlefield', 'strategic-reserves', 'deep-strike', 'embarked'] as const
type UnitFormation = (typeof UNIT_FORMATIONS)[number]

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
}

/** How often a stratagem may be used. `phase` and `turn` reset; `battle` does not. */
export type StratagemLimit = 'phase' | 'turn' | 'battle' | 'unlimited'

export const STRATAGEM_LIMITS: StratagemLimit[] = ['phase', 'turn', 'battle', 'unlimited']

export const STRATAGEMS_MAX = 24
export const STRATAGEM_CP_MAX = 6

/** A secondary mission, named by the player because the deck is not in the data either. */
export type Secondary = { key: string; name: string }
export type SecondaryStatus = 'active' | 'achieved' | 'discarded' | 'returned'

export const SECONDARIES_MAX = 6
const SECONDARY_HISTORY_MAX = 30

/**
 * Fixed secondaries are chosen once and scored all game; tactical ones are drawn as
 * play goes on. A card's payouts differ between the two, so the battle records which
 * is being played.
 */
export type SecondaryMode = 'fixed' | 'tactical'

export const SECONDARY_MODES: SecondaryMode[] = ['fixed', 'tactical']
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
  solo: boolean
  teamBattle: boolean
}

const DEFAULT_SETTINGS: BattleSettings = {
  limit: null,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  solo: false,
  teamBattle: false,
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
      solo: boolean
      teamBattle?: boolean
      clockLimitMinutes: number | null
    }
  | { kind: 'reset-setup' }
  | { kind: 'set-setup-step'; step: number }
  | { kind: 'set-attacker'; attackerId: PlayerId }
  | { kind: 'attach-roster'; roster: Roster; prep?: BattlePrep | null }
  | ({ kind: 'set-unit'; unitKey: string; destroyed: boolean } & OnBehalfOf)
  | ({ kind: 'wound-unit'; unitKey: string; delta: number } & OnBehalfOf)
  | ({ kind: 'deploy-unit'; unitKey: string; deployed: boolean } & OnBehalfOf)
  | ({ kind: 'set-unit-formation'; unitKey: string; formation: UnitFormation } & OnBehalfOf)
  | ({ kind: 'set-painted'; painted: boolean } & OnBehalfOf)
  | { kind: 'set-deployment'; patternId: string | null }
  | { kind: 'set-battlefield'; patternId: string; terrainLayoutId: string }
  | {
      kind: 'set-prep'
      stratagems: Stratagem[]
      secondaries: Secondary[]
      secondaryDeck?: Secondary[]
      primary: Secondary | null
      secondaryMode: SecondaryMode
    }
  /** `cp` overrides the printed cost, for the stratagems whose price depends on the board. */
  | ({ kind: 'use-stratagem'; key: string; cp?: number } & OnBehalfOf)
  | ({ kind: 'score-secondary'; key: string; delta: number } & OnBehalfOf)
  | ({ kind: 'set-secondary-status'; key: string; status: SecondaryStatus } & OnBehalfOf)
  | { kind: 'draw-secondary'; secondary: Secondary }
  | { kind: 'select-secret'; secondary: Secondary }
  | ({ kind: 'reveal-secret' } & OnBehalfOf)
  | { kind: 'begin-battle'; firstPlayerId: PlayerId; attackerId?: PlayerId }
  | ({ kind: 'adjust-cp'; delta: number } & OnBehalfOf)
  | ({ kind: 'score'; category: 'primary' | 'secondary'; delta: number } & OnBehalfOf)
  | { kind: 'correct-player'; playerId: PlayerId; resource: 'cp' | 'primary' | 'secondary'; delta: number }
  | { kind: 'settle-opponent-turn' }
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
  primary: number
  secondary: number
  roster: Roster | null
  /** Empty for a pasted list: nothing there names the units. */
  units: UnitState[]
  stratagems: Stratagem[]
  /** Every use, with when it happened, so a limit can be judged against the log. */
  uses: StratagemUse[]
  secondaries: Secondary[]
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
  resumePlayerId: PlayerId | null
  pendingSettlement: { playerId: PlayerId; round: number } | null
  /** The battlefield both players are using. Shared, so either may set it. */
  deploymentId: string | null
  settings: BattleSettings
  result: { reason: BattleEndReason; concededBy: PlayerId | null } | null
  players: PlayerState[]
  turns: { playerId: PlayerId; round: number; startedAt: number; endedAt: number | null }[]
  /**
   * The newest command still standing. Undo reaches only this one, which keeps
   * the log linear: there is never a hole in the middle to reason about.
   */
  undoable: { seq: number; by: PlayerId } | null
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
 * Its own settings decide it, and only here: a practice battle seats one, so a
 * second player following the link is refused for the same reason a full game
 * refuses a third rather than by a separate rule that could come to disagree.
 */
export function battleCapacity(settings: Pick<BattleSettings, 'solo' | 'teamBattle'>) {
  if (settings.solo) return 1
  return settings.teamBattle ? TEAM_BATTLE_PLAYERS : PLAYERS_PER_BATTLE
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

  if (entry.command.kind === 'begin-battle') state.undoable = null
  else if (entry.command.kind !== 'settle-opponent-turn') state.undoable = { seq: entry.seq, by: entry.by }
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
    resumePlayerId: null,
    pendingSettlement: null,
    deploymentId: null,
    settings: { ...DEFAULT_SETTINGS },
    result: null,
    players: playerIds.map((id, index) => ({
      id,
      side: playerSides?.[index] ?? index,
      cp: 0,
      cpGained: 0,
      cpSpent: 0,
      cpByRound: Array(BATTLE_ROUNDS).fill(0),
      primary: 0,
      secondary: 0,
      roster: null,
      units: [],
      stratagems: [],
      uses: [],
      secondaries: [],
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
      if (!GAME_SIZES.some((size) => size.limit === command.limit)) return 'choose a supported battle size'
      return null
    }
    case 'reset-setup':
      return state.status === 'setup' ? null : 'the battle has started'
    case 'set-setup-step':
      if (state.status !== 'setup') return 'the battle has started'
      return Number.isInteger(command.step) && command.step >= 0 && command.step <= 5 ? null : 'choose a setup section'
    case 'set-attacker':
      if (state.status !== 'setup') return 'the battle has started'
      return state.players.some((candidate) => candidate.id === command.attackerId) ? null : 'that attacker is not in this battle'
    case 'attach-roster': {
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
    case 'begin-battle': {
      if (state.status !== 'setup') return 'the battle has started'
      const requiredPlayers = state.settings.teamBattle ? TEAM_BATTLE_PLAYERS : PLAYERS_PER_BATTLE
      if (!state.settings.solo && state.players.length < requiredPlayers) return 'waiting for an opponent'
      if (state.players.some((candidate) => !candidate.roster))
        return state.settings.teamBattle ? 'every army needs a list' : 'both armies need a list'
      if (!state.players.some((candidate) => candidate.id === command.firstPlayerId)) return 'that player is not in this battle'
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
      if (state.pendingSettlement.playerId !== by) return 'only the side captain can settle the previous turn'
      return null
    }
    case 'advance': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!sameSide(state, state.activePlayerId, player.id)) return 'it is not your turn'
      if (helperAdvancePending(state, by, player)) return 'the active side has an action to settle'
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
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return namesAnotherArmy(command, actor) ? 'that is not one of their units' : 'that is not one of your units'
      if (!['battlefield', 'strategic-reserves'].includes(command.formation) && !unit.formationOptions?.includes(command.formation)) {
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
    case 'set-deployment':
    case 'set-battlefield': {
      // The battlefield is shared, so either player may set it, and only before the
      // first turn — moving the deployment zones mid-battle is not a thing.
      if (state.status !== 'setup') return 'the battle has started'
      return null
    }
    case 'set-prep': {
      if (state.status === 'finished') return 'the battle is over'
      // What an army brings is settled before the first turn, so the log cannot be
      // rewritten mid-game to a different set of cards.
      if (state.status === 'playing') return 'cards are settled before the battle begins'
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
    case 'set-secondary-status': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!mayNameSecondary(state, by, player, command.key)) return 'that is not one of your secondaries'
      return null
    }
    case 'draw-secondary': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (player.secondaryMode !== 'tactical') return 'only tactical missions are drawn'
      if (player.secondaries.filter((secondary) => player.secondaryStatus[secondary.key] === 'active').length >= TACTICAL_HAND_SIZE) {
        return 'your tactical hand is full'
      }
      if (!command.secondary.name.trim()) return 'name the secondary'
      if (player.secondaryDeck && !player.secondaryDeck.some((secondary) => secondary.key === command.secondary.key)) {
        return 'that secondary is not in your deck'
      }
      if (player.secondaries.some((secondary) => secondary.key === command.secondary.key)) return 'that secondary has already been drawn'
      if (player.secondaries.length >= SECONDARY_HISTORY_MAX) return 'the secondary history is full'
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
      if (!sameSide(state, by, player.id)) return 'that is not one of your secondaries'
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
        solo: command.solo,
        teamBattle: command.teamBattle ?? false,
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
    case 'attach-roster': {
      player.roster = { ...command.roster, name: command.roster.name.trim() }
      // A replaced list is a different army, so nothing about the old one survives.
      player.units = (command.roster.built?.units ?? []).map((unit) =>
        Object.assign({ destroyed: false, deployed: true, formation: 'battlefield' as const, alive: unit.models }, unit),
      )
      if (command.prep !== undefined) applyPrep(player, command.prep)
      if (state.status === 'setup') {
        state.deploymentId = null
        state.settings.terrainLayoutId = null
      }
      return
    }
    case 'set-unit': {
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return
      unit.destroyed = command.destroyed
      // The two stay in step in both directions: a unit brought back is whole again.
      unit.alive = command.destroyed ? 0 : unit.models
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
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (unit) {
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
      // Losing the last model is losing the unit: one event, not two states that
      // could contradict each other.
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
      const scored = (player.scored[command.key] ?? 0) + command.delta
      player.scored = { ...player.scored, [command.key]: scored }
      player.secondary = Object.values(player.scored).reduce((total, points) => total + points, player.corrections.secondary)
      const rounds = [...(player.scoredByRound[command.key] ?? Array(BATTLE_ROUNDS).fill(0))]
      rounds[state.round - 1] = (rounds[state.round - 1] ?? 0) + command.delta
      player.scoredByRound = { ...player.scoredByRound, [command.key]: rounds }
      player.secondaryByRound[state.round - 1] = (player.secondaryByRound[state.round - 1] ?? 0) + command.delta
      return
    }
    case 'set-secondary-status': {
      player.secondaryStatus = { ...player.secondaryStatus, [command.key]: command.status }
      if (command.key === player.secretSecondary && command.status !== 'active') player.secretRevealed = true
      return
    }
    case 'draw-secondary': {
      const secondary = { ...(player.secondaryDeck?.find((candidate) => candidate.key === command.secondary.key) ?? command.secondary) }
      player.secondaries.push(secondary)
      player.secondaryStatus = { ...player.secondaryStatus, [secondary.key]: 'active' }
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
      if (command.delta > 0) player.cpGained += command.delta
      else player.cpSpent += Math.abs(command.delta)
      player.cpByRound[state.round - 1] = player.cp
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
    case 'advance': {
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
      state.status = 'finished'
      state.result = { reason: command.reason ?? 'finished-early', concededBy: command.concededBy ?? null }
      state.resumePlayerId = state.activePlayerId
      state.activePlayerId = null
      return
    }
    case 'reopen-battle': {
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

function resetPlayer(player: PlayerState) {
  player.cp = 0
  player.cpGained = 0
  player.cpSpent = 0
  player.cpByRound = Array(BATTLE_ROUNDS).fill(0)
  player.primary = 0
  player.secondary = 0
  player.roster = null
  player.units = []
  player.stratagems = []
  player.uses = []
  player.secondaries = []
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
    player.cp += COMMAND_PHASE_CP
    player.cpGained += COMMAND_PHASE_CP
    player.cpByRound[state.round - 1] = player.cp
  }
}

export function sideCaptain(state: BattleState, side: number): PlayerState {
  return state.players.find((player) => player.side === side)!
}

/** Whether the command names an army other than the one recording it. */
function namesAnotherArmy(command: Command, actor: PlayerState): boolean {
  return 'playerId' in command && Boolean(command.playerId) && command.playerId !== actor.id
}

function armyCommand(command: Command): boolean {
  return ['attach-roster', 'set-unit', 'wound-unit', 'deploy-unit', 'set-unit-formation', 'set-painted'].includes(command.kind)
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
} | null {
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor) return null
  const target = targetArmy(state, actor, command)
  return {
    side: target.side,
    disposition: target.roster?.built?.disposition ?? null,
    primary: target.primary,
    secondary: target.secondary,
    primaryByRound: target.primaryByRound,
    secondaryByRound: target.secondaryByRound,
  }
}

export function sameSide(state: BattleState, left: PlayerId | null, right: PlayerId): boolean {
  const leftSide = state.players.find((player) => player.id === left)?.side
  return leftSide !== undefined && leftSide === state.players.find((player) => player.id === right)?.side
}

function mayNameSecondary(state: BattleState, by: PlayerId, player: PlayerState, key: string): boolean {
  if (!player.secondaries.some((secondary) => secondary.key === key)) return false
  return player.secretSecondary !== key || player.secretRevealed || sameSide(state, by, player.id)
}

export function helperAdvancePending(state: BattleState, by: PlayerId, player: PlayerState): boolean {
  if (state.phase === 'command' && by !== player.id && state.pendingSettlement?.playerId === player.id) return true
  if (by === player.id) return false
  const activeSecondaries = player.secondaries.filter((secondary) => player.secondaryStatus[secondary.key] === 'active')
  const hasUndrawnCard = player.secondaryDeck?.some((candidate) => !player.secondaries.some((secondary) => secondary.key === candidate.key))
  if (state.phase === 'command' && player.secondaryMode === 'tactical' && activeSecondaries.length < TACTICAL_HAND_SIZE && hasUndrawnCard) {
    return true
  }
  return state.phase === 'end' && Boolean(player.secretSecondary && !player.secretRevealed)
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
  if (prep.secondaries.length > SECONDARIES_MAX) return `that is more than ${SECONDARIES_MAX} secondaries`
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
