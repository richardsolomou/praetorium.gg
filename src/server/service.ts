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

  /** A user's battles with their current state folded from each log. */
  battles(userId: string, rules?: Parameters<typeof missionFor>[0] | null) {
    return this.repository.battlesByUser(userId).map((seats) => {
      const log = this.repository.log(seats.battle.id)
      const state = reduceBattle(
        seats.players.map((player) => player.id),
        log,
        seats.players.map((player) => player.side),
      )
      const viewerSide = state.players.find((player) => player.id === userId)?.side
      const ownDisposition = state.players.find((player) => player.side === viewerSide)?.roster?.built?.disposition ?? null
      const opposingDisposition = state.players.find((player) => player.side !== viewerSide)?.roster?.built?.disposition ?? null
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
        mission: rules
          ? missionFor(rules, ownDisposition, state.settings.solo ? ownDisposition : opposingDisposition, state.settings.missionPackId)
          : null,
        deploymentId: state.deploymentId,
        settings: state.settings,
        result: state.result,
        lastActivity: log.at(-1)?.at ?? seats.battle.createdAt,
      }
    })
  }

  userProfile(viewerId: string, userId: string) {
    const profile = this.repository.profileByUserId(userId)
    if (!profile) return null
    if (viewerId === userId) return profile
    return this.repository.battlesByUser(viewerId).some((battle) => battle.players.some((player) => player.id === userId)) ? profile : null
  }

  saveRoster(
    userId: string,
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
    if (existing && existing.userId !== userId) throw new Response('you do not own this roster', { status: 403 })
    this.repository.saveRoster({
      ...roster,
      detachmentId: JSON.stringify(roster.detachmentIds),
      id,
      userId,
      picks: JSON.stringify(roster.picks),
      prep: roster.prep ? JSON.stringify(roster.prep) : null,
      tags: '[]',
      now: this.clock(),
    })
    return { id }
  }

  /** A user's own saved lists, newest first. Their picks come back parsed. */
  savedRosters(userId: string) {
    return this.repository.rostersByUser(userId).map((row) => ({
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
  sharedRoster(id: string, userId: string | null = null, token: string | null = null) {
    const row = this.repository.roster(id)
    if (!row) return null
    if (row.visibility === 'unlisted' || row.userId === userId) return rosterFromRow(row)
    return userId && token && this.fieldedIn(token, userId, id) ? rosterFromRow(row) : null
  }

  /** Whether a reader shares a battle with the list they are asking about. */
  private fieldedIn(token: string, userId: string, rosterId: string) {
    const seats = this.repository.battleByToken(token)
    if (!seats?.players.some((player) => player.id === userId)) return false
    return this.repository
      .log(seats.battle.id)
      .some((entry) => entry.command.kind === 'attach-roster' && entry.command.roster.id === rosterId)
  }

  setRosterVisibility(userId: string, id: string, visibility: 'private' | 'unlisted') {
    if (!this.repository.setRosterVisibility(id, userId, visibility, this.clock())) {
      throw new Response('you do not own this roster', { status: 403 })
    }
  }

  deleteRoster(userId: string, id: string) {
    this.repository.deleteRoster(id, userId)
  }

  /** The datasheets a user owns, as a set the picker can ask about directly. */
  collection(userId: string) {
    return this.repository.collectionByUser(userId).map((row) => row.entryId)
  }

  setOwned(userId: string, entryId: string, owned: boolean) {
    if (owned) this.repository.addToCollection({ userId, entryId, now: this.clock() })
    else this.repository.removeFromCollection(userId, entryId)
  }

  favouriteFactions(userId: string) {
    return this.repository.favouriteFactionsByUser(userId).map((row) => row.catalogueId)
  }

  setFavouriteFaction(userId: string, catalogueId: string, favourite: boolean) {
    if (favourite) this.repository.addFavouriteFaction({ userId, catalogueId, now: this.clock() })
    else this.repository.removeFavouriteFaction(userId, catalogueId)
  }

  opponents(userId: string) {
    return this.friendships(userId).friends
  }

  friendships(userId: string) {
    const relationships = this.repository.friendships(userId)
    const related = new Set(relationships.flatMap((row) => [row.requesterId, row.addresseeId]))
    const named = (id: string) => {
      const user = this.repository.userById(id)
      return user ? { id: user.id, name: user.name } : null
    }
    return {
      friends: relationships
        .filter((row) => row.acceptedAt !== null)
        .map((row) => named(row.requesterId === userId ? row.addresseeId : row.requesterId))
        .filter((player): player is NonNullable<typeof player> => player !== null),
      incoming: relationships
        .filter((row) => row.acceptedAt === null && row.addresseeId === userId)
        .map((row) => named(row.requesterId))
        .filter((player): player is NonNullable<typeof player> => player !== null),
      outgoing: relationships
        .filter((row) => row.acceptedAt === null && row.requesterId === userId)
        .map((row) => named(row.addresseeId))
        .filter((player): player is NonNullable<typeof player> => player !== null),
      people: this.repository.usersExcept(userId).filter((user) => !related.has(user.id)),
    }
  }

  requestFriend(userId: string, friendId: string) {
    if (friendId === userId || !this.repository.userById(friendId)) throw new Response('choose another player', { status: 400 })
    if (!this.repository.requestFriend(userId, friendId, this.clock())) throw new Response('a connection already exists', { status: 409 })
  }

  acceptFriend(userId: string, requesterId: string) {
    if (!this.repository.acceptFriend(requesterId, userId, this.clock())) throw new Response('no such friend request', { status: 404 })
  }

  removeFriend(userId: string, friendId: string) {
    if (!this.repository.removeFriend(userId, friendId)) throw new Response('no such friendship', { status: 404 })
  }

  createBattle(
    userId: string,
    input?: string | { opponentId?: string; opponentIds?: string[]; solo: boolean; limit?: number; missionPackId: string | null },
  ) {
    const settings = typeof input === 'object' && input.limit !== undefined ? { ...input, limit: input.limit } : null
    const opponentIds = typeof input === 'string' ? [input] : (input?.opponentIds ?? (input?.opponentId ? [input.opponentId] : []))
    if (new Set(opponentIds).size !== opponentIds.length || opponentIds.some((id) => id === userId || !this.repository.userById(id))) {
      throw new Response('choose an opponent', { status: 400 })
    }
    const friendIds = new Set(this.opponents(userId).map((friend) => friend.id))
    if (opponentIds.some((id) => !friendIds.has(id))) throw new Response('battle opponents must be your friends', { status: 403 })
    if (settings && !settings.solo && !opponentIds.length) throw new Response('choose an opponent or a practice battle', { status: 400 })
    const token = randomToken()
    const id = randomId()
    this.repository.createBattle({
      id,
      token,
      userId,
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
    this.events.publish(id, [userId, ...opponentIds])
    return { token }
  }

  deleteBattle(token: string, userId: string) {
    const seats = this.mustSeat(token, userId)
    if (!this.repository.deleteBattle(seats.battle.id, userId)) throw new Response('only the battle creator can delete it', { status: 403 })
    this.events.publish(
      seats.battle.id,
      seats.players.map((player) => player.id),
    )
  }

  join(token: string, userId: string): JoinResult {
    const seats = this.mustFind(token)
    const state = reduceBattle(
      seats.players.map((player) => player.id),
      this.repository.log(seats.battle.id),
      seats.players.map((player) => player.side),
    )
    if (state.settings.solo) return 'full'
    const opener = seats.players.find((player) => player.side === 0)
    if (!opener || !this.opponents(opener.id).some((friend) => friend.id === userId)) {
      throw new Response('battle opponents must be friends', { status: 403 })
    }
    const result = this.repository.join({ battleId: seats.battle.id, userId, now: this.clock() })
    if (result === 'joined') this.events.publish(seats.battle.id, [...seats.players.map((player) => player.id), userId])
    return result
  }

  /**
   * `rules` is passed in rather than reached for, so the service stays testable
   * without a synced dataset.
   */
  screen(token: string, userId: string | null, rules?: Parameters<typeof missionFor>[0] | null): BattleScreen {
    const seats = this.mustFind(token)
    if (!userId || !this.seated(seats, userId)) {
      const state = reduceBattle(
        seats.players.map((player) => player.id),
        this.repository.log(seats.battle.id),
        seats.players.map((player) => player.side),
      )
      const capacity = state.settings.teamBattle ? 3 : PLAYERS_PER_BATTLE
      return { kind: 'invitation', free: !state.settings.solo && seats.players.length < capacity }
    }
    return this.seatedScreen(seats, userId, rules)
  }

  /** A readable account of the battle. Derived from the log, so nothing is stored for it. */
  report(token: string, userId: string) {
    const seats = this.mustSeat(token, userId)
    return battleReport(
      seats.players,
      this.repository.log(seats.battle.id),
      seats.players.map((player) => player.id),
      userId,
      seats.players.map((player) => player.side),
    )
  }

  submit(
    token: string,
    userId: string,
    expectedSeq: number,
    command: Command,
    rules?: Parameters<typeof missionFor>[0] | null,
  ): SubmitAnswer {
    const seats = this.mustSeat(token, userId)
    const result = this.repository.submit({ battleId: seats.battle.id, userId, expectedSeq, command, now: this.clock() }, (state) =>
      command.kind === 'begin-battle' && rules ? setupReferenceError(state, rules) : null,
    )
    if (result.outcome === 'appended')
      this.events.publish(
        seats.battle.id,
        seats.players.map((player) => player.id),
      )
    // Read after the write, so a refusal and a lost race answer with the state
    // that refused them rather than the one the caller was already holding.
    return { result, screen: this.seatedScreen(seats, userId, rules) }
  }

  /** Opening a battle stream is an authorization decision. */
  userBattleId(token: string, userId: string) {
    const seats = this.mustSeat(token, userId)
    return seats.battle.id
  }

  /** One battle as one player may see it. The only place a seated view is built. */
  private seatedScreen(seats: BattleSeats, userId: string, rules?: Parameters<typeof missionFor>[0] | null): SeatedScreen {
    const state = reduceBattle(
      seats.players.map((player) => player.id),
      this.repository.log(seats.battle.id),
      seats.players.map((player) => player.side),
    )
    const view = battleView(seats.battle, seats.players, state, userId, this.clock())
    const missionForSide = (side: number) => {
      const ownDisposition = view.players.find((player) => player.side === side)?.roster?.built?.disposition ?? null
      const opposingDisposition = view.players.find((player) => player.side !== side)?.roster?.built?.disposition ?? null
      return rules
        ? missionFor(rules, ownDisposition, state.settings.solo ? ownDisposition : opposingDisposition, state.settings.missionPackId)
        : null
    }
    if (state.status !== 'setup') {
      for (const player of view.players) {
        const primary = missionForSide(player.side)
        player.primaryCard = primary ? { key: primary.id, name: primary.name } : null
      }
    }
    const viewerSide = view.players.find((player) => player.id === userId)?.side
    return {
      kind: 'battle',
      view,
      mission: viewerSide === undefined ? null : missionForSide(viewerSide),
    }
  }

  private seated(seats: BattleSeats, userId: string) {
    return seats.players.some((player) => player.id === userId)
  }

  private mustSeat(token: string, userId: string) {
    const seats = this.mustFind(token)
    if (!this.seated(seats, userId)) throw new Response('you are not in this battle', { status: 403 })
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

function setupReferenceError(state: ReturnType<typeof reduceBattle>, rules: NonNullable<Parameters<typeof missionFor>[0]>): string | null {
  const [one, two] = state.players.map((player) => player.roster?.built?.disposition ?? null)
  const missions = [
    missionFor(rules, one ?? null, two ?? null, state.settings.missionPackId),
    missionFor(rules, two ?? null, one ?? null, state.settings.missionPackId),
  ]
  if (one && two && state.settings.missionPackId && missions.some((mission) => !mission)) {
    return 'the selected mission pack does not contain this matchup'
  }
  const deploymentId = state.deploymentId
  if (!deploymentId) return 'choose a deployment'
  if (!rules.deployments.some((deployment) => deployment.id === deploymentId)) return 'that deployment is not available'
  if (missions.some((mission) => mission?.deploymentIds.length && !mission.deploymentIds.includes(deploymentId)))
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
