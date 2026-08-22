import type { BattleEvents } from '../adapters/events'
import { randomId, randomToken } from 'ras-stack/auth'
import {
  battleCapacity,
  type Command,
  PAINTED_ARMY_POINTS,
  type PlayerId,
  reduceBattle,
  type Secondary,
  scoringTarget,
  sideCaptain,
  type Stratagem,
  type SubmitResult,
} from '../core/battle'
import { type BattleView, battleView } from '../core/battleView'
import { battleReport } from '../core/battleReport'
import type { RosterPick } from '../core/roster'
import type { RosterSource } from '../core/savedRoster'
import type { BattleHistory, BattleSeats, JoinResult, Repository } from '../db/repository'
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
    private readonly randomIndex: (limit: number) => number,
  ) {}

  /**
   * A user's battles with their current state folded from each log.
   *
   * The logs arrive with the seats, so the cost of this page does not grow by a
   * round trip for every battle the player has ever opened.
   */
  async battles(userId: string, rules?: Parameters<typeof missionFor>[0] | null) {
    const histories = await this.repository.battlesByUser(userId)
    return histories.map(({ battle, players, log }) => {
      const state = reduceBattle(
        players.map((player) => player.id),
        log,
        players.map((player) => player.side),
      )
      const viewerSide = state.players.find((player) => player.id === userId)?.side
      const ownDisposition = state.players.find((player) => player.side === viewerSide)?.roster?.built?.disposition ?? null
      const opposingDisposition = state.players.find((player) => player.side !== viewerSide)?.roster?.built?.disposition ?? null
      return {
        token: battle.token,
        createdAt: battle.createdAt,
        status: state.status,
        round: state.round,
        phase: state.phase,
        players: players.map((player) => player.name),
        playerIds: players.map((player) => player.id),
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
        lastActivity: log.at(-1)?.at ?? battle.createdAt,
      }
    })
  }

  /**
   * Someone's name and picture, to a viewer allowed to see it.
   *
   * A mutual friendship or shared battle permits this small public profile.
   */
  async userProfile(viewerId: string, userId: string) {
    const profile = await this.repository.profileByUserId(userId)
    if (!profile) return null
    if (viewerId === userId) return profile
    const friends = sortedFriends(await this.repository.relationships(viewerId), viewerId).friends
    if (friends.some((friend) => friend.id === userId)) return profile
    return (await this.repository.shareBattle(viewerId, userId)) ? profile : null
  }

  async saveRoster(
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
    const saved = await this.repository.saveRoster({
      ...roster,
      detachmentId: JSON.stringify(roster.detachmentIds),
      id,
      userId,
      picks: JSON.stringify(roster.picks),
      prep: roster.prep ? JSON.stringify(roster.prep) : null,
      tags: '[]',
      now: this.clock(),
    })
    if (!saved) throw new Response('you do not own this roster', { status: 403 })
    return { id }
  }

  /** A user's own saved lists, newest first. Their picks come back parsed. */
  async savedRosters(userId: string) {
    const rows = await this.repository.rostersByUser(userId)
    return rows.map((row) => ({
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
  async sharedRoster(id: string, userId: string | null = null, token: string | null = null) {
    const row = await this.repository.roster(id)
    if (!row) return null
    if (row.visibility === 'unlisted' || row.userId === userId) return rosterFromRow(row)
    if (!userId || !token) return null
    return (await this.fieldedIn(token, userId, id)) ? rosterFromRow(row) : null
  }

  /** Whether a reader shares a battle with the list they are asking about. */
  private async fieldedIn(token: string, userId: string, rosterId: string) {
    const history = await this.repository.battleHistoryByToken(token)
    if (!history?.players.some((player) => player.id === userId)) return false
    return history.log.some((entry) => entry.command.kind === 'attach-roster' && entry.command.roster.id === rosterId)
  }

  async setRosterVisibility(userId: string, id: string, visibility: 'private' | 'unlisted') {
    if (!(await this.repository.setRosterVisibility(id, userId, visibility, this.clock()))) {
      throw new Response('you do not own this roster', { status: 403 })
    }
  }

  async deleteRoster(userId: string, id: string) {
    await this.repository.deleteRoster(id, userId)
  }

  /** The datasheets a user owns, as a set the picker can ask about directly. */
  async collection(userId: string) {
    const rows = await this.repository.collectionByUser(userId)
    return rows.map((row) => row.entryId)
  }

  async setOwned(userId: string, entryId: string, owned: boolean) {
    if (owned) await this.repository.addToCollection({ userId, entryId, now: this.clock() })
    else await this.repository.removeFromCollection(userId, entryId)
  }

  async favouriteFactions(userId: string) {
    const rows = await this.repository.favouriteFactionsByUser(userId)
    return rows.map((row) => row.catalogueId)
  }

  async setFavouriteFaction(userId: string, catalogueId: string, favourite: boolean) {
    if (favourite) await this.repository.addFavouriteFaction({ userId, catalogueId, now: this.clock() })
    else await this.repository.removeFavouriteFaction(userId, catalogueId)
  }

  /**
   * The players this one may open a battle with.
   *
   * Asked for on its own rather than taken out of the friends page, because the
   * page also offers strangers to invite — and reaching for that here put a scan
   * of every account on the instance behind every battle opened and every link
   * followed, to answer a question about a handful of rows.
   */
  async opponents(userId: string) {
    return sortedFriends(await this.repository.relationships(userId), userId).friends
  }

  /**
   * Everyone this player is connected to, waiting on, or could ask.
   *
   * Two queries whatever the count: the relationships with the other party
   * already named, and the strangers, whom the database excludes rather than
   * this code filtering a fetched page down to whatever survives.
   */
  async friendships(userId: string) {
    const [relationships, people] = await Promise.all([this.repository.relationships(userId), this.repository.unrelatedUsers(userId)])
    return { ...sortedFriends(relationships, userId), people }
  }

  async requestFriend(userId: string, friendId: string) {
    if (friendId === userId || !(await this.repository.userById(friendId))) throw new Response('choose another player', { status: 400 })
    if (!(await this.repository.requestFriend(userId, friendId, this.clock())))
      throw new Response('a connection already exists', { status: 409 })
  }

  async acceptFriend(userId: string, requesterId: string) {
    if (!(await this.repository.acceptFriend(requesterId, userId, this.clock())))
      throw new Response('no such friend request', { status: 404 })
  }

  async removeFriend(userId: string, friendId: string) {
    if (!(await this.repository.removeFriend(userId, friendId))) throw new Response('no such friendship', { status: 404 })
  }

  async createBattle(
    userId: string,
    input?: string | { opponentId?: string; opponentIds?: string[]; solo: boolean; limit?: number; missionPackId: string | null },
  ) {
    const settings = typeof input === 'object' && input.limit !== undefined ? { ...input, limit: input.limit } : null
    const opponentIds = typeof input === 'string' ? [input] : (input?.opponentIds ?? (input?.opponentId ? [input.opponentId] : []))
    // One query for every named opponent rather than one apiece.
    const known = await this.repository.namesByIds(opponentIds)
    if (new Set(opponentIds).size !== opponentIds.length || opponentIds.some((id) => id === userId || !known.has(id))) {
      throw new Response('choose an opponent', { status: 400 })
    }
    const friendIds = new Set((await this.opponents(userId)).map((friend) => friend.id))
    if (opponentIds.some((id) => !friendIds.has(id))) throw new Response('battle opponents must be your friends', { status: 403 })
    if (settings && !settings.solo && !opponentIds.length) throw new Response('choose an opponent or a practice battle', { status: 400 })
    const token = randomToken()
    const id = randomId()
    await this.repository.createBattle({
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

  async deleteBattle(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    if (!(await this.repository.deleteBattle(seats.battle.id, userId)))
      throw new Response('only the battle creator can delete it', { status: 403 })
    this.events.publish(
      seats.battle.id,
      seats.players.map((player) => player.id),
    )
  }

  /**
   * Takes a seat behind a shared link.
   *
   * Only the seats are read here: whether there is a chair free is settled inside
   * the append, under the lock that stops two people taking the same one, so
   * reading the history out here as well would fold the same log twice to reach
   * the same answer.
   */
  async join(token: string, userId: string): Promise<JoinResult> {
    const seats = await this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    const opener = seats.players.find((player) => player.side === 0)
    if (!opener || !(await this.opponents(opener.id)).some((friend) => friend.id === userId)) {
      throw new Response('battle opponents must be friends', { status: 403 })
    }
    const result = await this.repository.join({ battleId: seats.battle.id, userId, now: this.clock() })
    if (result === 'joined') this.events.publish(seats.battle.id, [...seats.players.map((player) => player.id), userId])
    return result
  }

  /**
   * `rules` is passed in rather than reached for, so the service stays testable
   * without a synced dataset.
   */
  async screen(token: string, userId: string | null, rules?: Parameters<typeof missionFor>[0] | null): Promise<BattleScreen> {
    const history = await this.mustFind(token)
    if (!userId || !this.seated(history, userId)) {
      const state = reduceBattle(
        history.players.map((player) => player.id),
        history.log,
        history.players.map((player) => player.side),
      )
      return { kind: 'invitation', free: history.players.length < battleCapacity(state.settings) }
    }
    return this.seatedScreen(history, userId, rules)
  }

  /** A readable account of the battle. Derived from the log, so nothing is stored for it. */
  async report(token: string, userId: string) {
    const history = await this.mustFind(token)
    if (!this.seated(history, userId)) throw new Response('you are not in this battle', { status: 403 })
    return battleReport(
      history.players,
      history.log,
      history.players.map((player) => player.id),
      userId,
      history.players.map((player) => player.side),
    )
  }

  async submit(
    token: string,
    userId: string,
    expectedSeq: number,
    command: Command,
    rules?: Parameters<typeof missionFor>[0] | null,
  ): Promise<SubmitAnswer> {
    const seats = await this.mustSeat(token, userId)
    // The log comes back with the answer, so a refusal and a lost race both report
    // the state that refused them rather than the one the caller was holding —
    // and without a second read of a history the append had already in hand.
    const { result, log } = await this.repository.submit(
      { battleId: seats.battle.id, userId, expectedSeq, command, now: this.clock() },
      (state) => {
        if (command.kind === 'begin-battle') return rules ? setupReferenceError(state, rules) : null
        if (command.kind === 'score' || command.kind === 'score-secondary')
          return rules ? scoringCapError(state, userId, command, rules) : null
        return null
      },
      (state, submitted) => {
        if (submitted.kind !== 'draw-secondary') return submitted
        const actor = state.players.find((candidate) => candidate.id === userId)
        const player = actor ? sideCaptain(state, actor.side) : undefined
        const remaining = (player?.secondaryDeck ?? []).filter(
          (candidate) => !player?.secondaries.some((secondary) => secondary.key === candidate.key),
        )
        if (!remaining.length) return submitted
        return { ...submitted, secondary: remaining[this.randomIndex(remaining.length)]! }
      },
    )
    if (result.outcome === 'appended')
      this.events.publish(
        seats.battle.id,
        seats.players.map((player) => player.id),
      )
    return { result, screen: this.seatedScreen({ ...seats, log }, userId, rules) }
  }

  /** Opening a battle stream is an authorization decision. */
  async userBattleId(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    return seats.battle.id
  }

  /** One battle as one player may see it. The only place a seated view is built. */
  private seatedScreen(history: BattleHistory, userId: string, rules?: Parameters<typeof missionFor>[0] | null): SeatedScreen {
    const state = reduceBattle(
      history.players.map((player) => player.id),
      history.log,
      history.players.map((player) => player.side),
    )
    const view = battleView(history.battle, history.players, state, userId, this.clock())
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

  /** Seats alone, for the callers that do not need the history. */
  private async mustSeat(token: string, userId: string) {
    const seats = await this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    if (!this.seated(seats, userId)) throw new Response('you are not in this battle', { status: 403 })
    return seats
  }

  private async mustFind(token: string): Promise<BattleHistory> {
    const history = await this.repository.battleHistoryByToken(token)
    if (!history) throw new Response('no such battle', { status: 404 })
    return history
  }
}

/**
 * One player's relationships sorted into what the interface asks about: settled
 * friends, requests waiting on them, and requests they are waiting on.
 *
 * The only place that split is made, so `opponents` and the friends page cannot
 * disagree about who counts as a friend.
 */
function sortedFriends(relationships: Awaited<ReturnType<Repository['relationships']>>, userId: string) {
  const named = (row: (typeof relationships)[number]) => ({ id: row.otherId, name: row.otherName })
  return {
    friends: relationships.filter((row) => row.acceptedAt !== null).map(named),
    incoming: relationships.filter((row) => row.acceptedAt === null && row.addresseeId === userId).map(named),
    outgoing: relationships.filter((row) => row.acceptedAt === null && row.requesterId === userId).map(named),
  }
}

function rosterFromRow(row: NonNullable<Awaited<ReturnType<Repository['roster']>>>) {
  return {
    id: row.id,
    name: row.name,
    catalogueId: row.catalogueId,
    detachmentIds: detachmentIds(row.detachmentId),
    disposition: row.disposition,
    limit: row.limit,
    createdAt: row.createdAt,
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

/**
 * The matched-play ceilings, refused rather than only shown as guidance.
 *
 * Only a score that raises the total is checked: a correction reducing one, or one
 * made without a resolvable mission, is never guessed at and always allowed through.
 */
function scoringCapError(
  state: ReturnType<typeof reduceBattle>,
  by: PlayerId,
  command: Extract<Command, { kind: 'score' } | { kind: 'score-secondary' }>,
  rules: NonNullable<Parameters<typeof missionFor>[0]>,
): string | null {
  if (command.delta <= 0) return null
  const target = scoringTarget(state, by, command)
  if (!target) return null
  const category = command.kind === 'score' ? command.category : 'secondary'
  const opponentDisposition = state.players.find((player) => player.side !== target.side)?.roster?.built?.disposition ?? null
  const mission = missionFor(
    rules,
    target.disposition,
    state.settings.solo ? target.disposition : opponentDisposition,
    state.settings.missionPackId,
  )
  if (!mission) return null
  const roundCap = category === 'primary' ? mission.roundCap : mission.secondaryRoundCap
  const gameCap = category === 'primary' ? mission.gameCap : mission.secondaryGameCap
  const roundSoFar = (category === 'primary' ? target.primaryByRound : target.secondaryByRound)[state.round - 1] ?? 0
  const gameSoFar = category === 'primary' ? target.primary : target.secondary
  const label = category === 'primary' ? 'primary mission' : 'secondary missions'
  if (roundCap !== null && roundSoFar + command.delta > roundCap)
    return `that would score past this round’s ${roundCap} VP cap for ${label}`
  if (gameCap !== null && gameSoFar + command.delta > gameCap) return `that would score past the battle’s ${gameCap} VP cap for ${label}`
  return null
}

/** The legacy column held one id; new rows hold the ordered 11e purchase list. */
function detachmentIds(value: string | null): string[] {
  if (!value) return []
  if (!value.startsWith('[')) return [value]
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
}
