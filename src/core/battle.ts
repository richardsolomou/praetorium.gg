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
  selections: Selection[]
}

export type Command =
  | { kind: 'attach-roster'; roster: Roster }
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
}

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
    players: playerIds.map((id) => ({ id, cp: 0, primary: 0, secondary: 0, roster: null })),
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
  }[]
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
    })),
    undoable: state.undoable?.by === viewerId ? state.undoable.seq : null,
  }
}
