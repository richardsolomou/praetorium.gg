import type { BattleEvents } from '../adapters/events'
import {
  type BattleView,
  battleReport,
  battleView,
  type Command,
  PLAYERS_PER_BATTLE,
  reduceBattle,
  type Secondary,
  type Stratagem,
} from '../core/battle'
import type { BattleSeats, JoinResult, Repository, SubmitResult } from '../db/repository'
import { createId, createToken } from './crypto'
import { type Mission, missionFor } from './rules'
import { picksSchema, savedPrepSchema } from './schemas'

/**
 * What someone holding the link gets: the battle itself once they have a seat,
 * or the invitation until they take one. Reading a battle never seats anyone —
 * a link preview must not be able to take the second chair.
 */
export type Pick = {
  entryId: string
  catalogueId?: string
  models?: number
  choices?: Record<string, string>
  spreads?: Record<string, Record<string, number>>
  toggles?: Record<string, number>
  attachedTo?: number
}

export type SavedPrep = { stratagems: Stratagem[]; secondaries: Secondary[] }

export type SeatedScreen = { kind: 'battle'; view: BattleView; mission: Mission | null }

export type BattleScreen = SeatedScreen | { kind: 'invitation'; free: boolean }

/**
 * What a command answers: what happened to it, and what the battle now is.
 *
 * The screen comes back with the answer because the client's next command is
 * conditional on this one having landed. Left to learn that from the refetch a
 * round trip later, a page acts on a view it has already changed — sending a seq
 * from before its own command, or naming the wrong command to undo.
 */
export type SubmitAnswer = { result: SubmitResult; screen: SeatedScreen }

export class PraetoriumService {
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

  /** A player's battles with their current state folded from each log. */
  battles(playerId: string) {
    return this.repository.battlesOf(playerId).map((seats) => {
      const log = this.repository.log(seats.battle.id)
      const state = reduceBattle(
        seats.players.map((player) => player.id),
        log,
      )
      return {
        token: seats.battle.token,
        createdAt: seats.battle.createdAt,
        status: state.status,
        round: state.round,
        phase: state.phase,
        players: seats.players.map((player) => player.name),
        armies: state.players.map((player) => player.roster?.name ?? null),
        scores: state.players.map((player) => player.primary + player.secondary),
        lastActivity: log.at(-1)?.at ?? seats.battle.createdAt,
      }
    })
  }

  /**
   * The player an account is, claiming the guest in hand when it has none yet.
   *
   * Signing in must not cost someone their saved lists, so an account adopts the
   * guest identity it arrives with rather than starting a fresh one.
   */
  playerForUser(userId: string, guestId: string | null, name: string) {
    const claimed = this.repository.playerOfUser(userId)
    if (claimed) return claimed.id
    if (guestId && this.repository.player(guestId)) {
      this.repository.claimPlayer(guestId, userId)
      return guestId
    }
    const id = createId()
    this.repository.upsertPlayer({ id, name, now: this.clock() })
    this.repository.claimPlayer(id, userId)
    return id
  }

  saveRoster(
    playerId: string,
    roster: {
      id?: string
      name: string
      catalogueId: string
      detachmentIds: readonly string[]
      limit: number
      picks: readonly Pick[]
      prep: SavedPrep | null
    },
  ) {
    const id = roster.id ?? createId()
    this.repository.saveRoster({
      ...roster,
      detachmentId: JSON.stringify(roster.detachmentIds),
      id,
      playerId,
      picks: JSON.stringify(roster.picks),
      prep: roster.prep ? JSON.stringify(roster.prep) : null,
      now: this.clock(),
    })
    return { id }
  }

  /** A player's own saved lists, newest first. Their picks come back parsed. */
  savedRosters(playerId: string) {
    return this.repository.rostersOf(playerId).map((row) => ({
      id: row.id,
      name: row.name,
      catalogueId: row.catalogueId,
      detachmentIds: detachmentIds(row.detachmentId),
      limit: row.limit,
      updatedAt: row.updatedAt,
      picks: picksSchema.parse(JSON.parse(row.picks)),
      prep: row.prep ? savedPrepSchema.parse(JSON.parse(row.prep)) : null,
    }))
  }

  /** A roster shared by its random id, without any owner identity. */
  sharedRoster(id: string) {
    const row = this.repository.roster(id)
    return row
      ? {
          id: row.id,
          name: row.name,
          catalogueId: row.catalogueId,
          detachmentIds: detachmentIds(row.detachmentId),
          limit: row.limit,
          updatedAt: row.updatedAt,
          picks: picksSchema.parse(JSON.parse(row.picks)),
        }
      : null
  }

  deleteRoster(playerId: string, id: string) {
    this.repository.deleteRoster(id, playerId)
  }

  /** The datasheets a player owns, as a set the picker can ask about directly. */
  collection(playerId: string) {
    return this.repository.collectionOf(playerId).map((row) => row.entryId)
  }

  setOwned(playerId: string, entryId: string, owned: boolean) {
    if (owned) this.repository.addToCollection({ playerId, entryId, now: this.clock() })
    else this.repository.removeFromCollection(playerId, entryId)
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

  /**
   * `rules` is passed in rather than reached for, so the service stays testable
   * without a synced dataset.
   */
  screen(token: string, playerId: string | null, rules?: Parameters<typeof missionFor>[0] | null): BattleScreen {
    const seats = this.mustFind(token)
    if (!playerId || !this.seated(seats, playerId)) {
      return { kind: 'invitation', free: seats.players.length < PLAYERS_PER_BATTLE }
    }
    return this.seatedScreen(seats, playerId, rules)
  }

  /** A readable account of the battle. Derived from the log, so nothing is stored for it. */
  report(token: string, playerId: string) {
    const seats = this.mustFind(token)
    if (!this.seated(seats, playerId)) throw new Response('you are not in this battle', { status: 403 })
    return battleReport(
      seats.players,
      this.repository.log(seats.battle.id),
      seats.players.map((player) => player.id),
      playerId,
    )
  }

  submit(
    token: string,
    playerId: string,
    expectedSeq: number,
    command: Command,
    rules?: Parameters<typeof missionFor>[0] | null,
  ): SubmitAnswer {
    const seats = this.mustFind(token)
    if (!this.seated(seats, playerId)) throw new Response('you are not in this battle', { status: 403 })
    const result = this.repository.submit({ battleId: seats.battle.id, playerId, expectedSeq, command, now: this.clock() })
    if (result.outcome === 'appended') this.events.publish(seats.battle.id)
    // Read after the write, so a refusal and a lost race answer with the state
    // that refused them rather than the one the caller was already holding.
    return { result, screen: this.seatedScreen(seats, playerId, rules) }
  }

  /** The stream is for players, so opening one is an authorization decision. */
  playerBattleId(token: string, playerId: string) {
    const seats = this.mustFind(token)
    if (!this.seated(seats, playerId)) throw new Response('you are not in this battle', { status: 403 })
    return seats.battle.id
  }

  /** One battle as one player may see it. The only place a seated view is built. */
  private seatedScreen(seats: BattleSeats, playerId: string, rules?: Parameters<typeof missionFor>[0] | null): SeatedScreen {
    const state = reduceBattle(
      seats.players.map((player) => player.id),
      this.repository.log(seats.battle.id),
    )
    const view = battleView(seats.battle, seats.players, state, playerId)
    // Eleventh edition takes the mission from the two armies' dispositions rather
    // than from either player, so it is derived and never stored.
    const [one, two] = view.players.map((player) => player.roster?.built?.disposition ?? null)
    return { kind: 'battle', view, mission: rules ? missionFor(rules, one ?? null, two ?? null) : null }
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

/** The legacy column held one id; new rows hold the ordered 11e purchase list. */
function detachmentIds(value: string | null): string[] {
  if (!value) return []
  if (!value.startsWith('[')) return [value]
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
}
