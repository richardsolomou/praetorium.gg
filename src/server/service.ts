import type { BattleEvents } from '../adapters/events'
import { randomId, randomToken } from 'ras-stack/auth'
import {
  type BattleView,
  battleReport,
  battleView,
  type Command,
  PAINTED_ARMY_POINTS,
  PLAYERS_PER_BATTLE,
  reduceBattle,
  type Secondary,
  type Stratagem,
  type SubmitResult,
} from '../core/battle'
import type { RosterPick } from '../core/roster'
import type { RosterSource } from '../core/savedRoster'
import type { BattleSeats, JoinResult, Repository } from '../db/repository'
import { type Mission, missionFor } from './rules'
import { picksSchema, savedPrepSchema } from './schemas'

type SavedPrep = { stratagems: Stratagem[]; secondaries: Secondary[] }

type SeatedScreen = { kind: 'battle'; view: BattleView; mission: Mission | null }

/**
 * What someone holding the link gets: the battle itself once they have a seat,
 * or the invitation until they take one. Reading a battle never seats anyone —
 * a link preview must not be able to take the second chair.
 */
type BattleScreen = SeatedScreen | { kind: 'invitation'; free: boolean }

/**
 * What a command answers: what happened to it, and what the battle now is.
 *
 * The screen comes back with the answer because the client's next command is
 * conditional on this one having landed. Left to learn that from the refetch a
 * round trip later, a page acts on a view it has already changed — sending a seq
 * from before its own command, or naming the wrong command to undo.
 */
type SubmitAnswer = { result: SubmitResult; screen: SeatedScreen }

export class PraetoriumService {
  constructor(
    private readonly repository: Repository,
    private readonly clock: () => number,
    private readonly events: BattleEvents,
  ) {}

  /** A player's battles with their current state folded from each log. */
  battles(playerId: string, rules?: Parameters<typeof missionFor>[0] | null) {
    return this.repository.battlesByPlayer(playerId).map((seats) => {
      const log = this.repository.log(seats.battle.id)
      const state = reduceBattle(
        seats.players.map((player) => player.id),
        log,
        seats.players.map((player) => player.side),
      )
      const dispositions = [...new Set(state.players.map((player) => player.side))].map(
        (side) => state.players.find((player) => player.side === side)?.roster?.built?.disposition ?? null,
      )
      return {
        token: seats.battle.token,
        createdAt: seats.battle.createdAt,
        status: state.status,
        round: state.round,
        phase: state.phase,
        players: seats.players.map((player) => player.name),
        playerIds: seats.players.map((player) => player.id),
        sides: state.players.map((player) => player.side),
        armies: state.players.map((player) => player.roster?.name ?? null),
        detachments: state.players.map((player) => player.roster?.built?.detachments?.map((detachment) => detachment.name) ?? []),
        // The painted bonus pays at the end of the battle, so a running score does not carry it yet.
        scores: state.players.map(
          (player) => player.primary + player.secondary + (state.status === 'finished' && player.painted ? PAINTED_ARMY_POINTS : 0),
        ),
        mission: rules ? missionFor(rules, dispositions[0] ?? null, soloOpponent(state, dispositions), state.settings.missionPackId) : null,
        deploymentId: state.deploymentId,
        settings: state.settings,
        result: state.result,
        lastActivity: log.at(-1)?.at ?? seats.battle.createdAt,
      }
    })
  }

  /**
   * The player behind an account, minted on first sight.
   *
   * An account is the only way to be anyone here, so this is the one place a
   * player comes into existence. The name follows the account: the command log
   * points at `players.id`, which never changes, so renaming is free.
   */
  playerForUser(userId: string, name: string) {
    const existing = this.repository.playerByUserId(userId)
    if (existing) {
      if (existing.name !== name) this.repository.upsertPlayer({ id: existing.id, name, userId, now: this.clock() })
      return existing.id
    }
    const id = randomId()
    this.repository.upsertPlayer({ id, name, userId, now: this.clock() })
    return id
  }

  playerProfile(viewerId: string, playerId: string) {
    const profile = this.repository.profileByPlayerId(playerId)
    if (!profile) return null
    if (viewerId === playerId) return profile
    return this.repository.battlesByPlayer(viewerId).some((battle) => battle.players.some((player) => player.id === playerId))
      ? profile
      : null
  }

  saveRoster(
    playerId: string,
    roster: {
      id?: string
      name: string
      catalogueId: string
      detachmentIds: readonly string[]
      disposition: string | null
      limit: number
      picks: readonly RosterPick[]
      prep: SavedPrep | null
      visibility: 'private' | 'unlisted'
      source: RosterSource
    },
  ) {
    const id = roster.id ?? randomId()
    const existing = this.repository.roster(id)
    if (existing && existing.playerId !== playerId) throw new Response('you do not own this roster', { status: 403 })
    this.repository.saveRoster({
      ...roster,
      detachmentId: JSON.stringify(roster.detachmentIds),
      id,
      playerId,
      picks: JSON.stringify(roster.picks),
      prep: roster.prep ? JSON.stringify(roster.prep) : null,
      tags: '[]',
      now: this.clock(),
    })
    return { id }
  }

  /** A player's own saved lists, newest first. Their picks come back parsed. */
  savedRosters(playerId: string) {
    return this.repository.rostersByPlayer(playerId).map((row) => ({
      ...rosterFromRow(row),
      prep: row.prep ? savedPrepSchema.parse(JSON.parse(row.prep)) : null,
    }))
  }

  /**
   * An unlisted roster, its owner's private roster, or a list fielded in a battle the
   * reader is seated in.
   *
   * The last case widens nothing: a battle already shows every seat the opposing army
   * and its units, so the reader can see this list either way. The battle has to be
   * named, so the check stays one log rather than a scan of every battle they play.
   */
  sharedRoster(id: string, playerId: string | null = null, token: string | null = null) {
    const row = this.repository.roster(id)
    if (!row) return null
    if (row.visibility === 'unlisted' || row.playerId === playerId) return rosterFromRow(row)
    return playerId && token && this.fieldedIn(token, playerId, id) ? rosterFromRow(row) : null
  }

  /** Whether a reader shares a battle with the list they are asking about. */
  private fieldedIn(token: string, playerId: string, rosterId: string) {
    const seats = this.repository.battleByToken(token)
    if (!seats?.players.some((player) => player.id === playerId)) return false
    return this.repository
      .log(seats.battle.id)
      .some((entry) => entry.command.kind === 'attach-roster' && entry.command.roster.id === rosterId)
  }

  setRosterVisibility(playerId: string, id: string, visibility: 'private' | 'unlisted') {
    if (!this.repository.setRosterVisibility(id, playerId, visibility, this.clock())) {
      throw new Response('you do not own this roster', { status: 403 })
    }
  }

  deleteRoster(playerId: string, id: string) {
    this.repository.deleteRoster(id, playerId)
  }

  /** The datasheets a player owns, as a set the picker can ask about directly. */
  collection(playerId: string) {
    return this.repository.collectionByPlayer(playerId).map((row) => row.entryId)
  }

  setOwned(playerId: string, entryId: string, owned: boolean) {
    if (owned) this.repository.addToCollection({ playerId, entryId, now: this.clock() })
    else this.repository.removeFromCollection(playerId, entryId)
  }

  favouriteFactions(playerId: string) {
    return this.repository.favouriteFactionsByPlayer(playerId).map((row) => row.catalogueId)
  }

  setFavouriteFaction(playerId: string, catalogueId: string, favourite: boolean) {
    if (favourite) this.repository.addFavouriteFaction({ playerId, catalogueId, now: this.clock() })
    else this.repository.removeFavouriteFaction(playerId, catalogueId)
  }

  opponents(playerId: string) {
    return this.friendships(playerId).friends
  }

  friendships(playerId: string) {
    const relationships = this.repository.friendships(playerId)
    const related = new Set(relationships.flatMap((row) => [row.requesterId, row.addresseeId]))
    const named = (id: string) => {
      const player = this.repository.playerById(id)
      return player ? { id: player.id, name: player.name } : null
    }
    return {
      friends: relationships
        .filter((row) => row.acceptedAt !== null)
        .map((row) => named(row.requesterId === playerId ? row.addresseeId : row.requesterId))
        .filter((player): player is NonNullable<typeof player> => player !== null),
      incoming: relationships
        .filter((row) => row.acceptedAt === null && row.addresseeId === playerId)
        .map((row) => named(row.requesterId))
        .filter((player): player is NonNullable<typeof player> => player !== null),
      outgoing: relationships
        .filter((row) => row.acceptedAt === null && row.requesterId === playerId)
        .map((row) => named(row.addresseeId))
        .filter((player): player is NonNullable<typeof player> => player !== null),
      people: this.repository.playersExcept(playerId).filter((player) => !related.has(player.id)),
    }
  }

  requestFriend(playerId: string, friendId: string) {
    if (friendId === playerId || !this.repository.playerById(friendId)) throw new Response('choose another player', { status: 400 })
    if (!this.repository.requestFriend(playerId, friendId, this.clock())) throw new Response('a connection already exists', { status: 409 })
  }

  acceptFriend(playerId: string, requesterId: string) {
    if (!this.repository.acceptFriend(requesterId, playerId, this.clock())) throw new Response('no such friend request', { status: 404 })
  }

  removeFriend(playerId: string, friendId: string) {
    if (!this.repository.removeFriend(playerId, friendId)) throw new Response('no such friendship', { status: 404 })
  }

  createBattle(
    playerId: string,
    input?: string | { opponentId?: string; opponentIds?: string[]; solo: boolean; limit?: number; missionPackId: string | null },
  ) {
    const settings = typeof input === 'object' && input.limit !== undefined ? { ...input, limit: input.limit } : null
    const opponentIds = typeof input === 'string' ? [input] : (input?.opponentIds ?? (input?.opponentId ? [input.opponentId] : []))
    if (new Set(opponentIds).size !== opponentIds.length || opponentIds.some((id) => id === playerId || !this.repository.playerById(id))) {
      throw new Response('choose an opponent', { status: 400 })
    }
    const friendIds = new Set(this.opponents(playerId).map((friend) => friend.id))
    if (opponentIds.some((id) => !friendIds.has(id))) throw new Response('battle opponents must be your friends', { status: 403 })
    if (settings && !settings.solo && !opponentIds.length) throw new Response('choose an opponent or a practice battle', { status: 400 })
    const token = randomToken()
    const id = randomId()
    this.repository.createBattle({
      id,
      token,
      playerId,
      opponentIds,
      initialCommand: settings
        ? {
            kind: 'configure-battle',
            limit: settings.limit,
            missionPackId: settings.missionPackId,
            terrainLayoutId: null,
            twistId: null,
            solo: settings.solo,
            teamBattle: opponentIds.length === 2,
            clockLimitMinutes: null,
          }
        : undefined,
      now: this.clock(),
    })
    // The opponents are told before they have the battle open, which is what puts it
    // on their list without a reload.
    this.events.publish(id, [playerId, ...opponentIds])
    return { token }
  }

  deleteBattle(token: string, playerId: string) {
    const seats = this.mustSeat(token, playerId)
    if (!this.repository.deleteBattle(seats.battle.id, playerId))
      throw new Response('only the battle creator can delete it', { status: 403 })
    this.events.publish(
      seats.battle.id,
      seats.players.map((player) => player.id),
    )
  }

  join(token: string, playerId: string): JoinResult {
    const seats = this.mustFind(token)
    const state = reduceBattle(
      seats.players.map((player) => player.id),
      this.repository.log(seats.battle.id),
      seats.players.map((player) => player.side),
    )
    if (state.settings.solo) return 'full'
    const opener = seats.players.find((player) => player.side === 0)
    if (!opener || !this.opponents(opener.id).some((friend) => friend.id === playerId)) {
      throw new Response('battle opponents must be friends', { status: 403 })
    }
    const result = this.repository.join({ battleId: seats.battle.id, playerId, now: this.clock() })
    if (result === 'joined') this.events.publish(seats.battle.id, [...seats.players.map((player) => player.id), playerId])
    return result
  }

  /**
   * `rules` is passed in rather than reached for, so the service stays testable
   * without a synced dataset.
   */
  screen(token: string, playerId: string | null, rules?: Parameters<typeof missionFor>[0] | null): BattleScreen {
    const seats = this.mustFind(token)
    if (!playerId || !this.seated(seats, playerId)) {
      const state = reduceBattle(
        seats.players.map((player) => player.id),
        this.repository.log(seats.battle.id),
        seats.players.map((player) => player.side),
      )
      const capacity = state.settings.teamBattle ? 3 : PLAYERS_PER_BATTLE
      return { kind: 'invitation', free: !state.settings.solo && seats.players.length < capacity }
    }
    return this.seatedScreen(seats, playerId, rules)
  }

  /** A readable account of the battle. Derived from the log, so nothing is stored for it. */
  report(token: string, playerId: string) {
    const seats = this.mustSeat(token, playerId)
    return battleReport(
      seats.players,
      this.repository.log(seats.battle.id),
      seats.players.map((player) => player.id),
      playerId,
      seats.players.map((player) => player.side),
    )
  }

  submit(
    token: string,
    playerId: string,
    expectedSeq: number,
    command: Command,
    rules?: Parameters<typeof missionFor>[0] | null,
  ): SubmitAnswer {
    const seats = this.mustSeat(token, playerId)
    const result = this.repository.submit({ battleId: seats.battle.id, playerId, expectedSeq, command, now: this.clock() }, (state) =>
      command.kind === 'begin-battle' && rules ? setupReferenceError(state, rules) : null,
    )
    if (result.outcome === 'appended')
      this.events.publish(
        seats.battle.id,
        seats.players.map((player) => player.id),
      )
    // Read after the write, so a refusal and a lost race answer with the state
    // that refused them rather than the one the caller was already holding.
    return { result, screen: this.seatedScreen(seats, playerId, rules) }
  }

  /** The stream is for players, so opening one is an authorization decision. */
  playerBattleId(token: string, playerId: string) {
    const seats = this.mustSeat(token, playerId)
    return seats.battle.id
  }

  /** One battle as one player may see it. The only place a seated view is built. */
  private seatedScreen(seats: BattleSeats, playerId: string, rules?: Parameters<typeof missionFor>[0] | null): SeatedScreen {
    const state = reduceBattle(
      seats.players.map((player) => player.id),
      this.repository.log(seats.battle.id),
      seats.players.map((player) => player.side),
    )
    const view = battleView(seats.battle, seats.players, state, playerId, this.clock())
    // Eleventh edition takes the mission from the two armies' dispositions rather
    // than from either player, so it is derived and never stored.
    const [one, two] = [...new Set(view.players.map((player) => player.side))].map(
      (side) => view.players.find((player) => player.side === side)?.roster?.built?.disposition ?? null,
    )
    // A solo army has no opponent to pair with, so it plays its own disposition and still gets a mission.
    const facing = state.settings.solo ? (one ?? null) : (two ?? null)
    return { kind: 'battle', view, mission: rules ? missionFor(rules, one ?? null, facing, state.settings.missionPackId) : null }
  }

  private seated(seats: BattleSeats, playerId: string) {
    return seats.players.some((player) => player.id === playerId)
  }

  private mustSeat(token: string, playerId: string) {
    const seats = this.mustFind(token)
    if (!this.seated(seats, playerId)) throw new Response('you are not in this battle', { status: 403 })
    return seats
  }

  private mustFind(token: string): BattleSeats {
    const seats = this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    return seats
  }
}

function rosterFromRow(row: NonNullable<ReturnType<Repository['roster']>>) {
  return {
    id: row.id,
    name: row.name,
    catalogueId: row.catalogueId,
    detachmentIds: detachmentIds(row.detachmentId),
    disposition: row.disposition,
    limit: row.limit,
    updatedAt: row.updatedAt,
    picks: picksSchema.parse(JSON.parse(row.picks)),
    visibility: row.visibility,
    source: row.source,
  }
}

/** Solo practice pairs an army against itself; a real battle waits for the other list. */
function soloOpponent(state: { settings: { solo: boolean } }, dispositions: (string | null)[]) {
  return state.settings.solo ? (dispositions[0] ?? null) : (dispositions[1] ?? null)
}

function setupReferenceError(state: ReturnType<typeof reduceBattle>, rules: NonNullable<Parameters<typeof missionFor>[0]>): string | null {
  const [one, two] = state.players.map((player) => player.roster?.built?.disposition ?? null)
  const mission = missionFor(rules, one ?? null, two ?? null, state.settings.missionPackId)
  if (one && two && state.settings.missionPackId && !mission) return 'the selected mission pack does not contain this matchup'
  if (!state.deploymentId) return 'choose a deployment'
  if (!rules.deployments.some((deployment) => deployment.id === state.deploymentId)) return 'that deployment is not available'
  if (mission?.deploymentIds.length && !mission.deploymentIds.includes(state.deploymentId))
    return 'that deployment does not match the mission'
  if (!state.settings.terrainLayoutId) return null
  const terrain = rules.terrainLayouts.find((layout) => layout.id === state.settings.terrainLayoutId)
  if (!terrain) return 'that terrain layout is not available'
  const matchups = one && two ? new Set([`${one}-vs-${two}`, `${two}-vs-${one}`]) : new Set<string>()
  if (matchups.size && !matchups.has(terrain.matchupId)) return 'that terrain layout does not match the armies'
  if (terrain.deploymentId && terrain.deploymentId !== state.deploymentId) return 'that terrain layout does not match the deployment'
  if (!terrain.geometry) return 'exact terrain data is not available yet'
  return null
}

/** The legacy column held one id; new rows hold the ordered 11e purchase list. */
function detachmentIds(value: string | null): string[] {
  if (!value) return []
  if (!value.startsWith('[')) return [value]
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
}
