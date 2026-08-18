import type { BattleEvents } from '../adapters/events'
import { randomId, randomToken } from 'ras-stack/auth'
import {
  type BattleView,
  battleReport,
  battleView,
  type Command,
  PLAYERS_PER_BATTLE,
  reduceBattle,
  type Secondary,
  type Stratagem,
  type SubmitResult,
} from '../core/battle'
import type { RosterPick } from '../core/roster'
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
      )
      const dispositions = state.players.map((player) => player.roster?.built?.disposition ?? null)
      return {
        token: seats.battle.token,
        createdAt: seats.battle.createdAt,
        status: state.status,
        round: state.round,
        phase: state.phase,
        players: seats.players.map((player) => player.name),
        armies: state.players.map((player) => player.roster?.name ?? null),
        detachments: state.players.map((player) => player.roster?.built?.detachments?.map((detachment) => detachment.name) ?? []),
        scores: state.players.map((player) => player.primary + player.secondary + (player.painted ? 10 : 0)),
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
      source: 'legacy' | 'editable' | 'battlebase' | 'roster-file'
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

  /** An unlisted roster, or its owner's private roster, without exposing owner identity. */
  sharedRoster(id: string, playerId: string | null = null) {
    const row = this.repository.roster(id)
    return row && (row.visibility === 'unlisted' || row.playerId === playerId) ? rosterFromRow(row) : null
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
    return this.repository.playersExcept(playerId)
  }

  createBattle(
    playerId: string,
    input?: string | { opponentId?: string; solo: boolean; limit?: number; missionPackId: string | null; clockLimitMinutes: number | null },
  ) {
    const settings = typeof input === 'object' && input.limit !== undefined ? { ...input, limit: input.limit } : null
    const opponentId = typeof input === 'string' ? input : input?.opponentId
    if (opponentId && (opponentId === playerId || !this.repository.playerById(opponentId))) {
      throw new Response('choose an opponent', { status: 400 })
    }
    if (settings && !settings.solo && !opponentId) throw new Response('choose an opponent or a practice battle', { status: 400 })
    const token = randomToken()
    const id = randomId()
    this.repository.createBattle({
      id,
      token,
      playerId,
      opponentId,
      initialCommand: settings
        ? {
            kind: 'configure-battle',
            limit: settings.limit,
            missionPackId: settings.missionPackId,
            terrainLayoutId: null,
            twistId: null,
            solo: settings.solo,
            clockLimitMinutes: settings.clockLimitMinutes,
          }
        : undefined,
      now: this.clock(),
    })
    return { token }
  }

  deleteBattle(token: string, playerId: string) {
    const seats = this.mustFind(token)
    if (!this.seated(seats, playerId)) throw new Response('you are not in this battle', { status: 403 })
    if (!this.repository.deleteBattle(seats.battle.id, playerId))
      throw new Response('only the battle creator can delete it', { status: 403 })
    this.events.publish(seats.battle.id)
  }

  join(token: string, playerId: string): JoinResult {
    const seats = this.mustFind(token)
    const state = reduceBattle(
      seats.players.map((player) => player.id),
      this.repository.log(seats.battle.id),
    )
    if (state.settings.solo) return 'full'
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
      const state = reduceBattle(
        seats.players.map((player) => player.id),
        this.repository.log(seats.battle.id),
      )
      return { kind: 'invitation', free: !state.settings.solo && seats.players.length < PLAYERS_PER_BATTLE }
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
    const result = this.repository.submit({ battleId: seats.battle.id, playerId, expectedSeq, command, now: this.clock() }, (state) =>
      command.kind === 'begin-battle' && rules ? setupReferenceError(state, rules) : null,
    )
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
    const view = battleView(seats.battle, seats.players, state, playerId, this.clock())
    // Eleventh edition takes the mission from the two armies' dispositions rather
    // than from either player, so it is derived and never stored.
    const [one, two] = view.players.map((player) => player.roster?.built?.disposition ?? null)
    // A solo army has no opponent to pair with, so it plays its own disposition and still gets a mission.
    const facing = state.settings.solo ? (one ?? null) : (two ?? null)
    return { kind: 'battle', view, mission: rules ? missionFor(rules, one ?? null, facing, state.settings.missionPackId) : null }
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
