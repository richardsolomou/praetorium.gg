import type { BattleEvents } from '../adapters/events'
import { type BattleView, battleView, type Command, PLAYERS_PER_BATTLE, reduceBattle } from '../core/battle'
import type { BattleSeats, JoinResult, Repository, SubmitResult } from '../db/repository'
import { createId, createToken } from './crypto'

/**
 * What someone holding the link gets: the battle itself once they have a seat,
 * or the invitation until they take one. Reading a battle never seats anyone —
 * a link preview must not be able to take the second chair.
 */
export type BattleScreen = { kind: 'battle'; view: BattleView } | { kind: 'invitation'; free: boolean }

export class MusterService {
  constructor(
    private readonly repository: Repository,
    private readonly clock: () => number,
    private readonly events: BattleEvents,
  ) {}

  /** Names the player behind a cookie, creating the record on first sight. */
  identify(playerId: string, name: string) {
    this.repository.upsertPlayer({ id: playerId, name, now: this.clock() })
  }

  player(playerId: string) {
    return this.repository.player(playerId)
  }

  createBattle(playerId: string) {
    const token = createToken()
    this.repository.createBattle({ id: createId(), token, playerId, now: this.clock() })
    return { token }
  }

  join(token: string, playerId: string): JoinResult {
    const seats = this.mustFind(token)
    const result = this.repository.join({ battleId: seats.battle.id, playerId, now: this.clock() })
    if (result === 'joined') this.events.publish(seats.battle.id)
    return result
  }

  screen(token: string, playerId: string | null): BattleScreen {
    const seats = this.mustFind(token)
    if (!playerId || !this.seated(seats, playerId)) {
      return { kind: 'invitation', free: seats.players.length < PLAYERS_PER_BATTLE }
    }
    const state = reduceBattle(
      seats.players.map((player) => player.id),
      this.repository.log(seats.battle.id),
    )
    return { kind: 'battle', view: battleView(seats.battle, seats.players, state, playerId) }
  }

  submit(token: string, playerId: string, expectedSeq: number, command: Command): SubmitResult {
    const seats = this.mustFind(token)
    if (!this.seated(seats, playerId)) throw new Response('you are not in this battle', { status: 403 })
    const result = this.repository.submit({ battleId: seats.battle.id, playerId, expectedSeq, command, now: this.clock() })
    if (result.outcome === 'appended') this.events.publish(seats.battle.id)
    return result
  }

  /** The stream is for players, so opening one is an authorization decision. */
  playerBattleId(token: string, playerId: string) {
    const seats = this.mustFind(token)
    if (!this.seated(seats, playerId)) throw new Response('you are not in this battle', { status: 403 })
    return seats.battle.id
  }

  private seated(seats: BattleSeats, playerId: string) {
    return seats.players.some((player) => player.id === playerId)
  }

  private mustFind(token: string): BattleSeats {
    const seats = this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    return seats
  }
}
