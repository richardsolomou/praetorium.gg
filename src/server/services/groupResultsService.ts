import { leagueDraw, leagueFixtureStatus } from '../../core/groupLeague'
import type { BattleFilter, BattleOrder } from '../../core/battleFilter'
import { sideScore, standings } from '../../core/standings'
import { swissStandings } from '../../core/swiss'
import { SEALED_EVENT_RESULTS_BATTLE_LIMIT } from '../../core/sealedEventResults'
import type { BattlesCursor } from '../../contracts/battles'
import type { BattleFaction } from '../../shared/battleSummary'
import type { BattleCard, RepositoryPort } from '../spacetimeRepository'
import type { BattleFeedService } from './battleFeedService'
import { isSeated } from './battleHistory'
import type { GroupService } from './groupService'
import { swissMatches } from './sealedEventResultsService'

/** Pages of 500 battles a group's table reads, newest first, before it rates only those. */
const STANDINGS_PAGES = 20
/** How many battles the group tables hold across every group, about 5 KB each; the group read longest ago is let go first. */
const GROUP_BATTLES_HELD = STANDINGS_PAGES * SEALED_EVENT_RESULTS_BATTLE_LIMIT
const GROUP_RECENT_BATTLES = 6

export class GroupResultsService {
  private readonly groupBattlesHeld = new Map<
    string,
    { revision: string; size: number; read: Promise<{ battles: BattleCard[]; partial: boolean }> }
  >()

  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly groupService: GroupService,
    private readonly battleFeedService: BattleFeedService,
  ) {}

  /**
   * A group's standing table: every battle tagged for it, rated together, with rows for its current members only, so
   * someone who leaves drops off and comes back with their record if they rejoin. A private group shows it to members alone.
   */
  async groupStandings(token: string, viewerId: string | null, factions: readonly BattleFaction[] = []) {
    const { group, battlesRevision } = (await this.groupService.groupWithLeague(token, viewerId)) ?? {}
    if (!group || battlesRevision === undefined) return null
    const memberIds = new Set(group.members.filter((member) => member.status === 'accepted').map((member) => member.userId))
    if (hiddenFromViewer(group, viewerId)) return null
    const [{ battles: histories, partial }, practice] = await Promise.all([
      this.heldGroupBattles(token, battlesRevision),
      this.repository.practiceOpponents(),
    ])
    // Which hidden-list game each battle came from, so the page can name it and leave a game's battles inside its card.
    const gameOf = new Map<string, string>()
    const counted = this.battleFeedService.battleSummaries(groupBattlesOf(group, histories, gameOf), viewerId, null, factions)
    const tables = standings(counted, { exclude: practice.map((opponent) => opponent.id), now: this.clock() })
    const rows = tables.overall.filter((row) => memberIds.has(row.id))
    const recent = counted.filter((battle) => battle.status === 'finished').slice(0, GROUP_RECENT_BATTLES)
    // The reader's own group battles still being set up or played, which is what they most likely came back for.
    const active = viewerId ? counted.filter((battle) => battle.status !== 'finished' && battle.playerIds.includes(viewerId)) : []
    return {
      table: { faction: null, players: rows.length, rows },
      finished: counted.filter((battle) => battle.status === 'finished').length,
      recent,
      active,
      games: Object.fromEntries(
        [...recent, ...active].flatMap((battle) => {
          const game = gameOf.get(battle.token)
          return game ? [[battle.token, game]] : []
        }),
      ),
      // Hidden-list games with a battle still being set up or played, which stay current until it ends.
      playing: [...new Set(counted.flatMap((battle) => (battle.status === 'finished' ? [] : (gameOf.get(battle.token) ?? []))))],
      partial,
    }
  }

  /**
   * Every battle a group's table counts, read again only once `revision`, which the group read hands out, has moved; the
   * seats are named afresh each time, so a renamed player shows under their new name.
   */
  private async heldGroupBattles(token: string, revision: string) {
    let held = this.groupBattlesHeld.get(token)
    this.groupBattlesHeld.delete(token)
    if (held?.revision !== revision) {
      const entry = { revision, size: 0, read: this.readGroupBattles(token) }
      entry.read.then(
        ({ battles }) => (entry.size = battles.length),
        () => this.groupBattlesHeld.get(token) === entry && this.groupBattlesHeld.delete(token),
      )
      held = entry
    }
    // Reinserted last, so the first key is always the group read longest ago.
    this.groupBattlesHeld.set(token, held)
    const { battles, partial } = await held.read
    let size = 0
    for (const entry of this.groupBattlesHeld.values()) size += entry.size
    for (const [oldest, entry] of this.groupBattlesHeld) {
      if (size <= GROUP_BATTLES_HELD) break
      size -= entry.size
      this.groupBattlesHeld.delete(oldest)
    }
    const profiles = await this.repository.profilesByIds(battles.flatMap((battle) => battle.players.map((player) => player.id)))
    return {
      battles: battles.map((battle) => ({
        ...battle,
        players: battle.players.map((player) => {
          const profile = profiles.get(player.id)
          return profile ? { ...player, name: profile.name, image: profile.image, colour: profile.colour } : player
        }),
      })),
      partial,
    }
  }

  private async readGroupBattles(token: string) {
    const battles: BattleCard[] = []
    let before: BattlesCursor | undefined
    for (let page = 0; page < STANDINGS_PAGES; page++) {
      const { battles: found, nextCursor } = await this.repository.battlesByGroup(token, {
        limit: SEALED_EVENT_RESULTS_BATTLE_LIMIT,
        before,
      })
      battles.push(...found)
      before = nextCursor ?? undefined
      if (!before) break
    }
    return { battles, partial: before !== undefined }
  }

  /** One page of every battle played for a group, with the hidden-list game each came from; a private group shows them to members alone. */
  async groupBattles(
    token: string,
    viewerId: string | null,
    page: { before?: BattlesCursor; filter?: BattleFilter; order?: BattleOrder },
    factions: readonly BattleFaction[] = [],
  ) {
    const group = await this.groupService.group(token, viewerId)
    if (!group || hiddenFromViewer(group, viewerId)) return { battles: [], nextCursor: null, games: {} }
    const gameOf = new Map<string, string>()
    const found = await this.battleFeedService.filteredFeed(
      async (read) => {
        const { battles, nextCursor } = await this.repository.battlesByGroup(token, read)
        return { battles: groupBattlesOf(group, battles, gameOf), nextCursor }
      },
      page,
      viewerId,
      null,
      factions,
    )
    return {
      ...found,
      games: Object.fromEntries(
        found.battles.flatMap((battle) => (gameOf.has(battle.token) ? [[battle.token, gameOf.get(battle.token)!]] : [])),
      ),
    }
  }

  /**
   * A group's league: who plays, each round's fixtures and the table, read from the battles its fixtures started. A
   * draft's fixtures are its organizers' to review; a private group shows the league to members alone.
   */
  async groupLeague(token: string, viewerId: string | null, factions: readonly BattleFaction[] = []) {
    const { group, league } = (await this.groupService.groupWithLeague(token, viewerId)) ?? {}
    if (!group || !league || hiddenFromViewer(group, viewerId)) return null
    const published = league.publishedAt !== null
    const histories = published ? await this.repository.battlesByLeague(token) : []
    const battles = this.battleFeedService.battleSummaries(histories, viewerId, null, factions)
    const byToken = new Map(battles.map((battle) => [battle.token, battle]))
    const playing = new Set(league.players.filter((player) => !player.withdrawn).map((player) => player.userId))
    const drawn = published
      ? league.fixtures
      : group.organizer
        ? leagueDraw([...playing], league.seed).flatMap((tables, index) =>
            tables.map(([aId, bId], at) => ({ key: null, round: index + 1, table: at + 1, aId, bId, battleToken: null })),
          )
        : []
    const fixtures = drawn.map((fixture) => {
      const battle = fixture.battleToken ? (byToken.get(fixture.battleToken) ?? null) : null
      const score = (userId: string | null) =>
        battle && userId ? sideScore(battle, battle.sides[battle.playerIds.indexOf(userId)] ?? -1) : 0
      return {
        ...fixture,
        status: leagueFixtureStatus({ ...fixture, battle }, (userId) => playing.has(userId)),
        battle: battle && { token: battle.token, status: battle.status, scores: [score(fixture.aId), score(fixture.bId)] as const },
      }
    })
    return {
      published,
      // The seed decides the draw, so only the organizers reviewing a draft are given it.
      seed: group.organizer && !published ? league.seed : null,
      organizer: group.organizer,
      players: league.players,
      deadlines: league.deadlines,
      fixtures,
      table: published
        ? swissStandings(
            league.players.map((player) => player.userId),
            swissMatches(
              fixtures.filter((fixture) => fixture.status !== 'void'),
              battles,
            ),
          )
        : [],
    }
  }

  /** A group's ended leagues as stored, which a private group shows to members alone. */
  private async visiblePastLeagues(token: string, viewerId: string | null) {
    const found = await this.groupService.groupWithLeague(token, viewerId)
    if (!found) return null
    const { group } = found
    return hiddenFromViewer(group, viewerId) ? null : group.pastLeagues
  }

  /** A group's ended leagues, newest first, each named by the player who topped it. */
  async groupPastLeagues(token: string, viewerId: string | null) {
    const leagues = await this.visiblePastLeagues(token, viewerId)
    return leagues && leagues.map(({ id, publishedAt, endedAt, players }) => ({ id, publishedAt, endedAt, players: players.length }))
  }

  /** One ended league's table, read from the battles its fixtures started, as a running league's is. */
  async groupPastLeague(token: string, leagueId: string, viewerId: string | null, factions: readonly BattleFaction[] = []) {
    const league = (await this.visiblePastLeagues(token, viewerId))?.find((candidate) => candidate.id === leagueId)
    if (!league) return null
    const battles = this.battleFeedService.battleSummaries(await this.repository.battlesByLeague(token, leagueId), viewerId, null, factions)
    const byToken = new Map(battles.map((battle) => [battle.token, battle]))
    const playing = new Set(league.players.filter((player) => !player.withdrawn).map((player) => player.userId))
    const fixtures = league.fixtures.filter((fixture) => {
      const battle = fixture.battleToken ? (byToken.get(fixture.battleToken) ?? null) : null
      return leagueFixtureStatus({ ...fixture, battle }, (userId) => playing.has(userId)) !== 'void'
    })
    return {
      players: league.players,
      table: swissStandings(
        league.players.map((player) => player.userId),
        swissMatches(fixtures, battles),
      ),
    }
  }

  /** The group a battle counts for, and for a seated player during setup the groups it could; a private group's name stays with its players. */
  async battleGroups(token: string, viewerId: string | null) {
    const seats = await this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    const seated = viewerId !== null && isSeated(seats, viewerId)
    const { current, options } = await this.repository.battleGroups(seats.battle.id)
    const summary = (group: { token: string; name: string }) => ({ token: group.token, name: group.name })
    return {
      current: current && (seated || current.visibility === 'public') ? summary(current) : null,
      options: seated ? options.map((group) => ({ id: group.id, ...summary(group) })) : [],
    }
  }
}

/**
 * The battles a group feed read that count for the group, noting in `gameOf` the hidden-list game each came from.
 * A game's battles name its event; one from before events were recorded on battles names only its sealed event, now this group.
 */
function groupBattlesOf<History extends BattleCard>(
  group: { id: string; token: string; games: readonly { token: string }[] },
  histories: readonly History[],
  gameOf: Map<string, string>,
) {
  const gameEvents = new Set(group.games.map((game) => game.token))
  return histories.filter((history) => {
    const state = history.digest
    const fromGame = state.eventToken !== null && gameEvents.has(state.eventToken)
    if (fromGame) gameOf.set(history.battle.token, state.eventToken!)
    return state.groupId === group.id || fromGame || (state.eventToken === null && state.sealedEventToken === group.token)
  })
}

const hiddenFromViewer = (group: { visibility: string; members: readonly { userId: string; status: string }[] }, viewerId: string | null) =>
  group.visibility === 'private' && !group.members.some((member) => member.userId === viewerId && member.status === 'accepted')
