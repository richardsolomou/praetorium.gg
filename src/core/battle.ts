import type { Selection } from './evaluate'

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
  selections: Selection[]
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
type UnitState = SubmittedUnit & {
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
type SecondaryStatus = 'active' | 'achieved' | 'discarded'

export const SECONDARIES_MAX = 6
const SECONDARY_HISTORY_MAX = 30

/**
 * Fixed secondaries are chosen once and scored all game; tactical ones are drawn as
 * play goes on. A card's payouts differ between the two, so the battle records which
 * is being played.
 */
export type SecondaryMode = 'fixed' | 'tactical'

export const SECONDARY_MODES: SecondaryMode[] = ['fixed', 'tactical']

type BattlePrep = {
  stratagems: Stratagem[]
  secondaries: Secondary[]
  secondaryDeck?: Secondary[]
  primary: Secondary | null
  secondaryMode: SecondaryMode
}

type BattleEndReason = 'completed' | 'finished-early' | 'conceded'

type BattleSettings = {
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
const PRIMARY_GUIDE = 50
const SECONDARY_GUIDE = 40
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
const battleRoundLimit = (limit: number | null) => (isKotcLimit(limit) ? KOTC_ROUNDS : BATTLE_ROUNDS)

/** The format-specific cap for copies of one datasheet, before catalogue limits are applied. */
export const formatDatasheetLimit = (limit: number, repeatable: boolean) => (isKotcLimit(limit) ? (repeatable ? 2 : 1) : null)

export function detachmentPointsError(detachments: readonly { points: number | null }[], allowance: number | null): string | null {
  if (detachments.length <= 1 || allowance === null) return null
  const spent = detachments.reduce((total, detachment) => total + (detachment.points ?? 0), 0)
  return spent > allowance
    ? `This combination costs ${spent} DP; multiple detachments at this battle size may cost at most ${allowance} DP.`
    : null
}

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
  | { kind: 'attach-roster'; roster: Roster; prep?: BattlePrep | null }
  | { kind: 'set-unit'; unitKey: string; destroyed: boolean }
  | { kind: 'wound-unit'; unitKey: string; delta: number }
  | { kind: 'deploy-unit'; unitKey: string; deployed: boolean }
  | { kind: 'set-unit-formation'; unitKey: string; formation: UnitFormation; playerId?: PlayerId }
  | { kind: 'set-painted'; painted: boolean; playerId?: PlayerId }
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
  | { kind: 'use-stratagem'; key: string; cp?: number }
  | { kind: 'score-secondary'; key: string; delta: number }
  | { kind: 'set-secondary-status'; key: string; status: SecondaryStatus }
  | { kind: 'draw-secondary'; secondary: Secondary }
  | { kind: 'select-secret'; secondary: Secondary }
  | { kind: 'reveal-secret' }
  | { kind: 'begin-battle'; firstPlayerId: PlayerId; attackerId?: PlayerId }
  | { kind: 'adjust-cp'; delta: number }
  | { kind: 'score'; category: 'primary' | 'secondary'; delta: number }
  | { kind: 'correct-player'; playerId: PlayerId; resource: 'cp' | 'primary' | 'secondary'; delta: number }
  | { kind: 'advance' }
  | { kind: 'pause-clock' }
  | { kind: 'resume-clock' }
  | { kind: 'end-battle'; reason?: BattleEndReason; concededBy?: PlayerId }
  | { kind: 'reopen-battle' }
  | { kind: 'undo'; target: number }

/** `stale` carries the sequence the caller should have had; `refused` carries the domain reason. */
export type SubmitResult = { outcome: 'appended'; seq: number } | { outcome: 'stale'; seq: number } | { outcome: 'refused'; reason: string }

export type LoggedCommand = { seq: number; by: PlayerId; at: number; command: Command }

type PlayerState = {
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

type BattleState = {
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
export function reduceBattle(playerIds: readonly PlayerId[], log: readonly LoggedCommand[], playerSides?: readonly number[]): BattleState {
  const state: BattleState = {
    status: 'setup',
    setupStep: 0,
    round: 0,
    phase: 'command',
    activePlayerId: null,
    firstPlayerId: null,
    attackerId: null,
    resumePlayerId: null,
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

  const undone = new Set<number>()
  for (const entry of log) {
    if (entry.command.kind === 'undo') undone.add(entry.command.target)
    state.seq = Math.max(state.seq, entry.seq)
  }

  for (const entry of log) {
    if (entry.command.kind === 'undo' || undone.has(entry.seq)) continue
    const activeBefore = state.activePlayerId
    const roundBefore = state.round
    apply(state, entry.by, entry.command)
    if (entry.command.kind === 'begin-battle') {
      if (state.activePlayerId) state.turns.push({ playerId: state.activePlayerId, round: state.round, startedAt: entry.at, endedAt: null })
    } else if (entry.command.kind === 'advance' && (state.activePlayerId !== activeBefore || state.round !== roundBefore)) {
      const current = state.turns.at(-1)
      if (current) current.endedAt = entry.at
      if (state.activePlayerId) state.turns.push({ playerId: state.activePlayerId, round: state.round, startedAt: entry.at, endedAt: null })
    } else if (entry.command.kind === 'end-battle') {
      const current = state.turns.at(-1)
      if (current) current.endedAt = entry.at
    } else if (entry.command.kind === 'reopen-battle' && state.activePlayerId) {
      state.turns.push({ playerId: state.activePlayerId, round: state.round, startedAt: entry.at, endedAt: null })
    }
    state.undoable = entry.command.kind === 'begin-battle' ? null : { seq: entry.seq, by: entry.by }
  }

  return state
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
      return Number.isInteger(command.step) && command.step >= 0 && command.step <= 4 ? null : 'choose a setup section'
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
    case 'advance': {
      if (state.status !== 'playing') return 'the battle is not running'
      // The only rule that depends on turn order: a phase ends when the player
      // playing it says so, and never when their opponent does.
      if (!sameSide(state, state.activePlayerId, by)) return 'it is not your turn'
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
      // Your own casualties are yours to report, the same as your own command
      // points are yours to spend.
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
      if (namesAnotherArmy(command, actor) && state.status !== 'setup') return 'only your own units once the battle has started'
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
      if (stratagem.turn === 'your-turn' && !sameSide(state, state.activePlayerId, by)) return `${stratagem.name} is used on your turn`
      if (stratagem.turn === 'opponent-turn' && sameSide(state, state.activePlayerId, by))
        return `${stratagem.name} is used on your opponent’s turn`
      const cost = command.cp ?? stratagem.cp
      if (!Number.isInteger(cost) || cost < 0 || cost > STRATAGEM_CP_MAX) return 'that is not a possible cost'
      if (player.cp < cost) return 'not enough command points'
      if (limitReached(player, stratagem, state)) return `${stratagem.name} has been used this ${stratagem.limit}`
      return null
    }
    case 'score-secondary': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!player.secondaries.some((secondary) => secondary.key === command.key)) return 'that is not one of your secondaries'
      if (!Number.isInteger(command.delta) || command.delta === 0) return 'victory points move in whole steps'
      if ((player.scored[command.key] ?? 0) + command.delta < 0) return 'that would go below zero'
      return null
    }
    case 'set-secondary-status': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (!player.secondaries.some((secondary) => secondary.key === command.key)) return 'that is not one of your secondaries'
      return null
    }
    case 'draw-secondary': {
      if (state.status !== 'playing') return 'the battle is not running'
      if (player.secondaryMode !== 'tactical') return 'only tactical missions are drawn'
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
      state.deploymentId = null
      state.settings = { ...state.settings, terrainLayoutId: null, twistId: null }
      state.players.forEach(resetPlayer)
      return
    }
    case 'set-setup-step': {
      state.setupStep = command.step
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
      state.attackerId = command.attackerId ?? command.firstPlayerId
      state.result = null
      enterTurn(state, command.firstPlayerId)
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
    case 'advance': {
      const next = PHASES.indexOf(state.phase) + 1
      if (next < PHASES.length) {
        state.phase = PHASES[next]!
        return
      }
      const opponent = state.players.find((candidate) => !sameSide(state, candidate.id, by))
      // The player who did not go first ending their turn is what ends the round.
      if (by === state.firstPlayerId && opponent) {
        enterTurn(state, opponent.id)
        return
      }
      if (state.round === battleRoundLimit(state.settings.limit)) {
        state.status = 'finished'
        state.result = { reason: 'completed', concededBy: null }
        state.resumePlayerId = state.activePlayerId
        state.activePlayerId = null
        return
      }
      state.round++
      if (state.firstPlayerId) {
        enterTurn(state, state.firstPlayerId)
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

const titled = (slug: string) =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(' ')

function enterTurn(state: BattleState, playerId: PlayerId) {
  state.activePlayerId = playerId
  state.phase = 'command'
  const activeSide = state.players.find((candidate) => candidate.id === playerId)?.side
  const player = activeSide === undefined ? undefined : sideCaptain(state, activeSide)
  if (player) {
    player.cp += COMMAND_PHASE_CP
    player.cpGained += COMMAND_PHASE_CP
    player.cpByRound[state.round - 1] = player.cp
  }
}

function sideCaptain(state: BattleState, side: number): PlayerState {
  return state.players.find((player) => player.side === side)!
}

/** Whether the command names an army other than the one running it. */
function namesAnotherArmy(command: Command, actor: PlayerState): boolean {
  return 'playerId' in command && Boolean(command.playerId) && command.playerId !== actor.id
}

function armyCommand(command: Command): boolean {
  return ['attach-roster', 'set-unit', 'wound-unit', 'deploy-unit', 'set-unit-formation', 'set-painted'].includes(command.kind)
}

/**
 * The army a command acts on.
 *
 * Setting the table is done together, often from one device, so a formation or a
 * battle-ready bonus may name whose army it is for. Everything else is the actor's
 * own, and a named army only reaches this far because `validate` allowed it.
 */
function targetArmy(state: BattleState, actor: PlayerState, command: Command): PlayerState {
  if (!armyCommand(command)) return sideCaptain(state, actor.side)
  const named = 'playerId' in command && command.playerId ? command.playerId : null
  return (named ? state.players.find((candidate) => candidate.id === named) : undefined) ?? actor
}

function sameSide(state: BattleState, left: PlayerId | null, right: PlayerId): boolean {
  const leftSide = state.players.find((player) => player.id === left)?.side
  return leftSide !== undefined && leftSide === state.players.find((player) => player.id === right)?.side
}

function rosterLimit(state: BattleState, player: PlayerState): number | null {
  if (state.settings.limit === null || !state.settings.teamBattle) return state.settings.limit
  const teammates = state.players.filter((candidate) => candidate.side === player.side).length
  return state.settings.limit / teammates
}

/** One thing that happened, in the words a player would use about it. */
type ReportEntry = { seq: number; at: number; round: number; phase: Phase; by: string; commandKind: Command['kind']; text: string }

/**
 * A readable account of the battle, derived from the log.
 *
 * The log is already a complete record of the game, so this is a rendering of it
 * rather than anything new: nothing is stored to make a report possible. Undone
 * commands are absent, because they did not happen.
 */
export function battleReport(
  players: readonly { id: PlayerId; name: string }[],
  log: readonly LoggedCommand[],
  playerIds: readonly PlayerId[] = players.map((player) => player.id),
  viewerId?: PlayerId,
  playerSides?: readonly number[],
): ReportEntry[] {
  const named = new Map(players.map((player) => [player.id, player.name]))
  const state = reduceBattle(playerIds, [], playerSides)
  const undone = new Set(log.flatMap((entry) => (entry.command.kind === 'undo' ? [entry.command.target] : [])))
  const entries: ReportEntry[] = []

  for (const entry of log) {
    if (entry.command.kind === 'undo' || undone.has(entry.seq)) continue
    const before = { round: state.round, phase: state.phase, active: state.activePlayerId }
    apply(state, entry.by, entry.command)
    const text = describe(entry.command, state, before, entry.by, named, viewerId)
    if (text) {
      entries.push({
        seq: entry.seq,
        at: entry.at,
        round: before.round || state.round,
        phase: before.phase,
        by: entry.by,
        commandKind: entry.command.kind,
        text,
      })
    }
  }

  return entries
}

function describe(
  command: Command,
  after: BattleState,
  before: { round: number; phase: Phase; active: PlayerId | null },
  by: PlayerId,
  named: Map<PlayerId, string>,
  viewerId?: PlayerId,
): string | null {
  const who = named.get(by) ?? 'Someone'
  // Setting the table can be done for someone else, so a line names the army it changed.
  const targetId = 'playerId' in command && command.playerId ? command.playerId : by
  const player = after.players.find((candidate) => candidate.id === targetId)
  const whose = targetId === by ? 'their' : `${named.get(targetId) ?? 'another player'}’s`

  switch (command.kind) {
    case 'configure-battle':
      return `${who} sets a ${command.limit}-point${command.solo ? ' practice' : ''} battle`
    case 'reset-setup':
      return `${who} resets battle setup`
    case 'set-setup-step':
      return null
    case 'attach-roster': {
      const detachment = command.roster.built?.detachment
      return `${who} brought ${command.roster.name}${detachment && !command.roster.name.includes(detachment) ? ` (${detachment})` : ''}`
    }
    case 'set-prep': {
      const parts = [
        command.primary ? `${command.primary.name} as the primary` : null,
        player?.secondaries.length ? `${player.secondaries.map((secondary) => secondary.name).join(' and ')} as secondaries` : null,
        command.stratagems.length ? `${command.stratagems.length} stratagems` : null,
      ].filter(Boolean)
      return parts.length ? `${who} took ${parts.join(', ')}` : null
    }
    case 'set-deployment':
      // Only the id reaches here, so it is titled rather than left as a slug.
      return command.patternId ? `The battlefield is ${titled(command.patternId)}` : null
    case 'set-battlefield':
      return `The battlefield is ${titled(command.terrainLayoutId)}`
    case 'deploy-unit': {
      const unit = player?.units.find((candidate) => candidate.key === command.unitKey)?.name ?? 'a unit'
      return command.deployed ? `${who} put ${unit} on the table` : `${who} held ${unit} in reserve`
    }
    case 'set-unit-formation': {
      const unit = player?.units.find((candidate) => candidate.key === command.unitKey)?.name ?? 'a unit'
      return `${who} places ${whose} ${unit} in ${titled(command.formation)}`
    }
    case 'set-painted':
      return command.painted ? `${who} marks ${whose} army battle ready` : `${who} removes the battle ready bonus from ${whose} army`
    case 'begin-battle':
      return `The battle begins, ${named.get(command.attackerId ?? command.firstPlayerId) ?? 'someone'} attacking and ${named.get(command.firstPlayerId) ?? 'someone'} taking the first turn`
    case 'advance': {
      if (after.status === 'finished') return 'The last round ends'
      if (after.round !== before.round) return `Round ${after.round} begins`
      if (after.activePlayerId !== before.active) return `The turn passes to ${named.get(after.activePlayerId ?? '') ?? 'the other player'}`
      return `${who} ends the ${before.phase} phase`
    }
    case 'adjust-cp':
      return command.delta > 0 ? `${who} gains ${command.delta} CP` : `${who} spends ${Math.abs(command.delta)} CP`
    case 'use-stratagem': {
      const stratagem = player?.stratagems.find((candidate) => candidate.key === command.key)
      return stratagem ? `${who} uses ${stratagem.name} for ${command.cp ?? stratagem.cp} CP` : `${who} uses a stratagem`
    }
    case 'score':
      return `${who} scores ${command.delta} ${command.category}`
    case 'correct-player': {
      const target = named.get(command.playerId) ?? 'a player'
      return `${who} corrects ${target}’s ${command.resource} by ${command.delta > 0 ? '+' : ''}${command.delta}`
    }
    case 'score-secondary': {
      const secondary = player?.secondaries.find((candidate) => candidate.key === command.key)
      const name =
        player?.secretSecondary === command.key && !player.secretRevealed && viewerId !== by ? 'a secret mission' : secondary?.name
      return `${who} scores ${command.delta} on ${name ?? 'a secondary'}`
    }
    case 'set-secondary-status': {
      const secondary = player?.secondaries.find((candidate) => candidate.key === command.key)
      return `${who} marks ${secondary?.name ?? 'a secondary'} ${command.status}`
    }
    case 'draw-secondary':
      return `${who} draws ${player?.secondaries.find((secondary) => secondary.key === command.secondary.key)?.name ?? 'a secondary'}`
    case 'select-secret': {
      const selected = player?.secondaries.find((secondary) => secondary.key === command.secondary.key)?.name ?? 'a secret mission'
      return viewerId === by ? `${who} selects ${selected} as a secret mission` : `${who} selects a secret mission`
    }
    case 'reveal-secret': {
      const secondary = player?.secondaries.find((candidate) => candidate.key === player.secretSecondary)
      return `${who} reveals ${secondary?.name ?? 'a secret mission'}`
    }
    case 'set-unit': {
      const unit = player?.units.find((candidate) => candidate.key === command.unitKey)?.name ?? 'a unit'
      return command.destroyed ? `${who} loses ${unit}` : `${who} brings ${unit} back`
    }
    case 'wound-unit': {
      const unit = player?.units.find((candidate) => candidate.key === command.unitKey)
      const name = unit?.name ?? 'a unit'
      if (unit && unit.alive === 0) return `${who} loses ${name}`
      const count = Math.abs(command.delta)
      const models = count === 1 ? 'model' : 'models'
      return command.delta < 0 ? `${who} loses ${count} ${models} from ${name}` : `${who} returns ${count} ${models} to ${name}`
    }
    case 'pause-clock':
    case 'resume-clock':
      return null
    case 'end-battle':
      return command.reason === 'conceded' ? `${who} concedes` : `${who} calls the battle early`
    case 'reopen-battle':
      return `${who} reopens the battle`
    default:
      return null
  }
}

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
  /** Present only when the viewer is the one who may take it back. */
  undoable: number | null
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
          player.id === viewerId
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
    advancePrompt: sameSide(state, state.activePlayerId, viewerId) ? scoringPrompt(state, viewerId) : null,
    undoable: state.undoable?.seq ?? null,
  }
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
