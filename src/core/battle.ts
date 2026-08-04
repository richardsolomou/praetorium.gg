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
export const COMMAND_PHASE_CP = 1

export const PLAYERS_PER_BATTLE = 2
export const PLAYER_NAME_MAX_LENGTH = 40
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
export type Roster = { name: string; text: string; built?: BuiltRoster }

export type BuiltRoster = {
  catalogueId: string
  /** The catalogue revision this list was priced and validated against. */
  revision: string
  /** The game size agreed for the battle, so both players see the same ceiling. */
  limit: number
  /** Named for display, since an opponent's device may have no catalogue loaded. */
  detachment: string | null
  /** The force disposition the detachment plays under; the pair decides the mission. */
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

export type SubmittedUnit = { key: string; name: string; points: number; models: number }

export type UnitState = SubmittedUnit & { destroyed: boolean }

/**
 * A stratagem as the player transcribes it from their own book.
 *
 * None of this is in the community catalogue data — a detachment there carries its
 * rule and its objective, and nothing about stratagems — so the content comes from
 * the player and is saved with their list. What this file owns is the part worth
 * automating: what it costs, and how often it may be used.
 */
export type Stratagem = { key: string; name: string; cp: number; limit: StratagemLimit }

/** How often a stratagem may be used. `phase` and `turn` reset; `battle` does not. */
export type StratagemLimit = 'phase' | 'turn' | 'battle' | 'unlimited'

export const STRATAGEM_LIMITS: StratagemLimit[] = ['phase', 'turn', 'battle', 'unlimited']

export const STRATAGEMS_MAX = 12
export const STRATAGEM_CP_MAX = 6

/** A secondary mission, named by the player because the deck is not in the data either. */
export type Secondary = { key: string; name: string }

export const SECONDARIES_MAX = 6

/**
 * Fixed secondaries are chosen once and scored all game; tactical ones are drawn as
 * play goes on. A card's payouts differ between the two, so the battle records which
 * is being played.
 */
export type SecondaryMode = 'fixed' | 'tactical'

export const SECONDARY_MODES: SecondaryMode[] = ['fixed', 'tactical']

/**
 * The conventional matched-play ceilings, shown as guidance and never enforced.
 *
 * Refusing a score on a number this file is not certain of would stop a real game
 * at a real table, which is far worse than displaying a total that has gone past
 * what the mission allows.
 */
export const PRIMARY_GUIDE = 50
export const SECONDARY_GUIDE = 40

/** The matched-play game sizes, smallest first. */
export const GAME_SIZES = [
  { name: 'Incursion', limit: 1000 },
  { name: 'Strike Force', limit: 2000 },
  { name: 'Onslaught', limit: 3000 },
] as const

export type Command =
  | { kind: 'attach-roster'; roster: Roster }
  | { kind: 'set-unit'; unitKey: string; destroyed: boolean }
  | { kind: 'set-prep'; stratagems: Stratagem[]; secondaries: Secondary[]; primary: Secondary | null; secondaryMode: SecondaryMode }
  | { kind: 'use-stratagem'; key: string }
  | { kind: 'score-secondary'; key: string; delta: number }
  | { kind: 'begin-battle'; firstPlayerId: PlayerId }
  | { kind: 'adjust-cp'; delta: number }
  | { kind: 'score'; category: 'primary' | 'secondary'; delta: number }
  | { kind: 'advance' }
  | { kind: 'end-battle' }
  | { kind: 'undo'; target: number }

export type LoggedCommand = { seq: number; by: PlayerId; at: number; command: Command }

export type PlayerState = {
  id: PlayerId
  cp: number
  primary: number
  secondary: number
  roster: Roster | null
  /** Empty for a pasted list: nothing there names the units. */
  units: UnitState[]
  stratagems: Stratagem[]
  /** Every use, with when it happened, so a limit can be judged against the log. */
  uses: StratagemUse[]
  secondaries: Secondary[]
  /** The primary mission being played, so both devices score against the same one. */
  primaryCard: Secondary | null
  secondaryMode: SecondaryMode
  /** What each named secondary has scored, keyed the same way. */
  scored: Record<string, number>
}

export type StratagemUse = { key: string; round: number; phase: Phase; turn: PlayerId | null }

export type BattleState = {
  status: 'setup' | 'playing' | 'finished'
  /** 0 during setup, then 1 through `BATTLE_ROUNDS`. */
  round: number
  phase: Phase
  activePlayerId: PlayerId | null
  firstPlayerId: PlayerId | null
  players: PlayerState[]
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
export function reduceBattle(playerIds: readonly PlayerId[], log: readonly LoggedCommand[]): BattleState {
  const state: BattleState = {
    status: 'setup',
    round: 0,
    phase: 'command',
    activePlayerId: null,
    firstPlayerId: null,
    players: playerIds.map((id) => ({
      id,
      cp: 0,
      primary: 0,
      secondary: 0,
      roster: null,
      units: [],
      stratagems: [],
      uses: [],
      secondaries: [],
      primaryCard: null,
      secondaryMode: 'fixed',
      scored: {},
    })),
    undoable: null,
    seq: 0,
  }

  const undone = new Set<number>()
  for (const entry of log) {
    if (entry.command.kind === 'undo') undone.add(entry.command.target)
    state.seq = Math.max(state.seq, entry.seq)
  }

  for (const entry of log) {
    if (entry.command.kind === 'undo' || undone.has(entry.seq)) continue
    apply(state, entry.by, entry.command)
    state.undoable = { seq: entry.seq, by: entry.by }
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
  const player = state.players.find((candidate) => candidate.id === by)
  if (!player) return 'you are not in this battle'

  switch (command.kind) {
    case 'attach-roster': {
      if (state.status !== 'setup') return 'the battle has started'
      const name = command.roster.name.trim()
      if (!name) return 'name your army'
      if (name.length > ROSTER_NAME_MAX_LENGTH) return 'that name is too long'
      if (!command.roster.text.trim()) return 'paste your list'
      if (command.roster.text.length > ROSTER_MAX_LENGTH) return 'that list is too long'
      return null
    }
    case 'begin-battle': {
      if (state.status !== 'setup') return 'the battle has started'
      if (state.players.length < PLAYERS_PER_BATTLE) return 'waiting for an opponent'
      if (state.players.some((candidate) => !candidate.roster)) return 'both armies need a list'
      if (!state.players.some((candidate) => candidate.id === command.firstPlayerId)) return 'that player is not in this battle'
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
    case 'advance': {
      if (state.status !== 'playing') return 'the battle is not running'
      // The only rule that depends on turn order: a phase ends when the player
      // playing it says so, and never when their opponent does.
      if (state.activePlayerId !== by) return 'it is not your turn'
      return null
    }
    case 'end-battle': {
      if (state.status !== 'playing') return 'the battle is not running'
      return null
    }
    case 'set-unit': {
      if (state.status !== 'playing') return 'the battle is not running'
      // Your own casualties are yours to report, the same as your own command
      // points are yours to spend.
      if (!player.units.some((unit) => unit.key === command.unitKey)) return 'that is not one of your units'
      return null
    }
    case 'set-prep': {
      if (state.status === 'finished') return 'the battle is over'
      if (command.stratagems.length > STRATAGEMS_MAX) return `that is more than ${STRATAGEMS_MAX} stratagems`
      if (command.stratagems.some((stratagem) => !stratagem.name.trim())) return 'name every stratagem'
      if (command.stratagems.some((stratagem) => stratagem.cp < 0 || stratagem.cp > STRATAGEM_CP_MAX)) {
        return `a stratagem costs between 0 and ${STRATAGEM_CP_MAX} command points`
      }
      if (command.secondaries.length > SECONDARIES_MAX) return `that is more than ${SECONDARIES_MAX} secondaries`
      if (command.secondaries.some((secondary) => !secondary.name.trim())) return 'name every secondary'
      if (command.primary && !command.primary.name.trim()) return 'name the primary mission'
      return null
    }
    case 'use-stratagem': {
      if (state.status !== 'playing') return 'the battle is not running'
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.key)
      if (!stratagem) return 'that is not one of your stratagems'
      if (player.cp < stratagem.cp) return 'not enough command points'
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
    case 'undo': {
      if (!state.undoable) return 'there is nothing to undo'
      if (state.undoable.seq !== command.target) return 'only the last action can be undone'
      if (state.undoable.by !== by) return 'that was your opponent’s action'
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
  const player = state.players.find((candidate) => candidate.id === by)
  if (!player) return

  switch (command.kind) {
    case 'attach-roster': {
      player.roster = { ...command.roster, name: command.roster.name.trim() }
      // A replaced list is a different army, so nothing about the old one survives.
      player.units = (command.roster.built?.units ?? []).map((unit) => Object.assign({ destroyed: false }, unit))
      return
    }
    case 'set-unit': {
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (unit) unit.destroyed = command.destroyed
      return
    }
    case 'set-prep': {
      player.stratagems = command.stratagems.map((stratagem) => ({ ...stratagem, name: stratagem.name.trim() }))
      player.secondaries = command.secondaries.map((secondary) => ({ ...secondary, name: secondary.name.trim() }))
      player.primaryCard = command.primary ? { ...command.primary, name: command.primary.name.trim() } : null
      player.secondaryMode = command.secondaryMode
      // A secondary nobody can see must not keep contributing to the total.
      const kept = Object.fromEntries(
        Object.entries(player.scored).filter(([key]) => player.secondaries.some((secondary) => secondary.key === key)),
      )
      player.scored = kept
      player.secondary = Object.values(kept).reduce((total, points) => total + points, 0)
      return
    }
    case 'use-stratagem': {
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.key)
      if (!stratagem) return
      player.cp -= stratagem.cp
      player.uses.push({ key: stratagem.key, round: state.round, phase: state.phase, turn: state.activePlayerId })
      return
    }
    case 'score-secondary': {
      const scored = (player.scored[command.key] ?? 0) + command.delta
      player.scored = { ...player.scored, [command.key]: scored }
      player.secondary = Object.values(player.scored).reduce((total, points) => total + points, 0)
      return
    }
    case 'begin-battle': {
      state.status = 'playing'
      state.round = 1
      state.firstPlayerId = command.firstPlayerId
      enterTurn(state, command.firstPlayerId)
      return
    }
    case 'adjust-cp': {
      player.cp += command.delta
      return
    }
    case 'score': {
      player[command.category] += command.delta
      return
    }
    case 'advance': {
      const next = PHASES.indexOf(state.phase) + 1
      if (next < PHASES.length) {
        state.phase = PHASES[next]!
        return
      }
      const opponent = state.players.find((candidate) => candidate.id !== by)
      // The player who did not go first ending their turn is what ends the round.
      if (by === state.firstPlayerId && opponent) {
        enterTurn(state, opponent.id)
        return
      }
      state.round++
      if (state.round > BATTLE_ROUNDS) {
        state.status = 'finished'
        state.activePlayerId = null
        return
      }
      if (state.firstPlayerId) enterTurn(state, state.firstPlayerId)
      return
    }
    case 'end-battle': {
      state.status = 'finished'
      state.activePlayerId = null
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

/** Whether a stratagem's allowance is spent for now. `turn` and `phase` reset as play moves on. */
function limitReached(player: PlayerState, stratagem: Stratagem, state: BattleState): boolean {
  if (stratagem.limit === 'unlimited') return false
  const uses = player.uses.filter((use) => use.key === stratagem.key)
  if (stratagem.limit === 'battle') return uses.length > 0
  const thisTurn = uses.filter((use) => use.round === state.round && use.turn === state.activePlayerId)
  return stratagem.limit === 'turn' ? thisTurn.length > 0 : thisTurn.some((use) => use.phase === state.phase)
}

function enterTurn(state: BattleState, playerId: PlayerId) {
  state.activePlayerId = playerId
  state.phase = 'command'
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (player) player.cp += COMMAND_PHASE_CP
}

export type BattleView = {
  token: string
  status: BattleState['status']
  round: number
  phase: Phase
  rounds: number
  /** What a command must carry to be accepted. Anything older is a stale client. */
  seq: number
  viewerId: PlayerId
  activePlayerId: PlayerId | null
  players: {
    id: PlayerId
    name: string
    isViewer: boolean
    isActive: boolean
    cp: number
    primary: number
    secondary: number
    total: number
    roster: Roster | null
    units: UnitState[]
    /** What is still on the table, for the line a player actually glances at. */
    standing: number
    /** Each stratagem with whether it can be used right now, and why not when it cannot. */
    stratagems: { key: string; name: string; cp: number; limit: StratagemLimit; refusal: string | null }[]
    secondaries: { key: string; name: string; points: number }[]
    primaryCard: Secondary | null
    secondaryMode: SecondaryMode
  }[]
  /** The conventional ceilings, for display beside a total. */
  guides: { primary: number; secondary: number }
  /** Present only when the viewer is the one who may take it back. */
  undoable: number | null
}

/**
 * The only place visibility is decided. Every route and every server function
 * reads a battle through here, so a new field cannot leak by being added to a
 * shape someone else assembled by hand.
 *
 * Nothing in a running battle is secret today: matched play shows both lists,
 * and points are public. Hidden information — a secondary still in hand, an
 * undeployed reserve — arrives as a field held back for its owner here, and
 * nowhere else.
 */
export function battleView(
  battle: { token: string },
  players: readonly { id: PlayerId; name: string }[],
  state: BattleState,
  viewerId: PlayerId,
): BattleView {
  const named = new Map(players.map((player) => [player.id, player.name]))
  return {
    token: battle.token,
    status: state.status,
    round: state.round,
    phase: state.phase,
    rounds: BATTLE_ROUNDS,
    seq: state.seq,
    viewerId,
    activePlayerId: state.activePlayerId,
    players: state.players.map((player) => ({
      id: player.id,
      name: named.get(player.id) ?? 'Unknown',
      isViewer: player.id === viewerId,
      isActive: player.id === state.activePlayerId,
      cp: player.cp,
      primary: player.primary,
      secondary: player.secondary,
      total: player.primary + player.secondary,
      roster: player.roster,
      units: player.units,
      standing: player.units.filter((unit) => !unit.destroyed).length,
      stratagems: player.stratagems.map((stratagem) => ({
        ...stratagem,
        // The same rule the server enforces, so the interface never offers what
        // would be refused.
        refusal: validate(state, player.id, { kind: 'use-stratagem', key: stratagem.key }),
      })),
      primaryCard: player.primaryCard,
      secondaryMode: player.secondaryMode,
      secondaries: player.secondaries.map((secondary) => ({
        key: secondary.key,
        name: secondary.name,
        points: player.scored[secondary.key] ?? 0,
      })),
    })),
    guides: { primary: PRIMARY_GUIDE, secondary: SECONDARY_GUIDE },
    undoable: state.undoable?.by === viewerId ? state.undoable.seq : null,
  }
}
