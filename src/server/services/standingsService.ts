import { createHash } from 'node:crypto'
import { byId } from '../../core/collections'
import { routeSlug } from '../../core/slug'
import { OVERALL, type RatingPoint, type Standing, type StandingFaction } from '../../core/standings'
import { ACHIEVEMENTS, achievementPoints, achievements, type AchievementId, type EarnedAchievements } from '../../core/achievements'
import type { BattleFaction } from '../../shared/battleSummary'
import { type StandingsRefresh, storedBattle } from '../standingsRefresh'
import type { RepositoryPort } from '../spacetimeRepository'
import type { SealedEventResultsService } from './sealedEventResultsService'

/** One table of players: everybody, or everybody who has fielded one faction. */
type StandingsTable = { faction: StandingFaction | null; players: number; rows: Standing[] }

/** The overall table and a table per faction played. */
type StandingsAnswer = { overall: StandingsTable; factions: (StandingsTable & { faction: StandingFaction })[] }

/** One player's place in each table they appear in. */
type PlayerRanking<T> = { faction: T; place: number; of: number; standing: Standing }
type PlayerRankings = {
  overall: PlayerRanking<null> | null
  factions: PlayerRanking<StandingFaction>[]
  /** The player's overall rating after each of their counted battles, oldest first. */
  history: readonly RatingPoint[]
}

const ACHIEVEMENT_IDS = new Set<string>(ACHIEVEMENTS.map((achievement) => achievement.id))
/** The medals on offer, so a check against other ones, such as a release still serving through a deploy, is not stored. */
const ACHIEVEMENT_DEFINITIONS = createHash('sha256')
  .update(JSON.stringify(ACHIEVEMENTS.map(({ id, metric, count }) => [id, metric, count])))
  .digest('hex')
  .slice(0, 16)
type AchievementRows = { achievementId: AchievementId; earnedAt: number | null; seen: boolean }[]

/** How long one leaderboard read serves repeated reads, such as a burst of tabs refetching after the same signal. */
const STANDINGS_HOLD_MS = 5_000

/** How much of a table is sent. Nobody reads past this, and every faction played costs one. */
const STANDINGS_ROWS = 50

export class StandingsService {
  private standingsHeld: { key: string; until: number; answer: Promise<StandingsAnswer> } | null = null
  /** Each player's medal check in progress, so a burst of reads checks once. */
  private readonly achievementChecks = new Map<string, Promise<AchievementRows>>()
  private definitionsSynced: Promise<boolean> | null = null

  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly battleFactions: () => Promise<readonly BattleFaction[]>,
    private readonly standingsRefresh: StandingsRefresh,
    private readonly sealedEventResultsService: SealedEventResultsService,
  ) {}

  /** Brings the stored results and ratings up to the battles; reads call it first, so they never serve ratings older than a battle they could see. */
  refreshStandings() {
    return this.standingsRefresh.refresh()
  }

  /** Each army's table as a reader is shown it, keyed by the slug the stored ratings name it with. */
  private async armyTables() {
    const factions = await this.battleFactions()
    return new Map(
      factions.map(({ displayName, icon }) => {
        const slug = routeSlug(displayName)
        return [slug, { slug, displayName, icon }]
      }),
    )
  }

  /** Names each row from its account, so a renamed player is shown under their current name. */
  private async namedRows<T extends { id: string }>(
    rows: readonly T[],
  ): Promise<(T & { name: string; image: string | null; colour: string | null })[]> {
    const profiles = await this.repository.profilesByIds([...new Set(rows.map((row) => row.id))])
    return rows.map((row) => {
      const profile = profiles.get(row.id)
      return { ...row, name: profile?.name ?? 'Unknown player', image: profile?.image ?? null, colour: profile?.colour ?? null }
    })
  }

  async standings(): Promise<StandingsAnswer> {
    const now = this.clock()
    const key = await this.refreshStandings()
    if (this.standingsHeld?.key === key && this.standingsHeld.until > now) return this.standingsHeld.answer
    const read = async (): Promise<StandingsAnswer> => {
      const armies = await this.armyTables()
      // A player has a row in each table they played in, each with that table's record, so each table is named on its own.
      const tables = await Promise.all(
        (await this.repository.leaderboard(0, STANDINGS_ROWS)).map(async (table) => ({ ...table, rows: await this.namedRows(table.rows) })),
      )
      const overall = tables.find((table) => table.table === OVERALL)
      return {
        overall: { faction: null, players: overall?.players ?? 0, rows: overall?.rows ?? [] },
        factions: tables
          .flatMap((table) => {
            const faction = table.table === OVERALL ? undefined : armies.get(table.table)
            return faction ? [{ faction, seats: table.seats, players: table.players, rows: table.rows }] : []
          })
          .sort((one, other) => other.seats - one.seats || one.faction.displayName.localeCompare(other.faction.displayName))
          .map(({ seats: _seats, ...table }) => table),
      }
    }
    const answer = read()
    this.standingsHeld = { key, until: now + STANDINGS_HOLD_MS, answer }
    answer.catch(() => {
      if (this.standingsHeld?.answer === answer) this.standingsHeld = null
    })
    return answer
  }

  /** Where one player sits in each table they are ranked in, read from the same stored ratings the leaderboard pages. */
  async playerRankings(userId: string): Promise<PlayerRankings> {
    await this.refreshStandings()
    const { places, history } = await this.repository.playerStandings(userId, 0)
    const [named] = await this.namedRows([{ id: userId }])
    const armies = await this.armyTables()
    const ranking = <T>(faction: T, place: (typeof places)[number]) => ({
      faction,
      place: place.place,
      of: place.of,
      standing: { ...place.standing, name: named!.name, image: named!.image },
    })
    const overall = places.find((place) => place.table === OVERALL)
    return {
      overall: overall ? ranking(null, overall) : null,
      // Ordered by how much of this player's own record each army accounts for. The
      // leaderboard's order is how much everybody has played it, which on a profile
      // puts the army they brought once above the one they always bring.
      factions: places
        .flatMap((place) => {
          const faction = place.table === OVERALL ? undefined : armies.get(place.table)
          return faction ? [ranking(faction, place)] : []
        })
        .toSorted((one, other) => other.standing.battles - one.standing.battles || one.place - other.place),
      history,
    }
  }

  /**
   * What a player has earned, as last checked. A write that could change it has the player checked again here, on the
   * next read, rather than every player on every write.
   */
  async playerAchievements(userId: string): Promise<EarnedAchievements> {
    const earned: Partial<Record<AchievementId, number | null>> = {}
    for (const row of await this.checkedAchievements(userId)) earned[row.achievementId] = row.earnedAt
    return { earned, points: achievementPoints(earned) }
  }

  /** The medals a player has earned and not yet been told of. */
  async newAchievements(userId: string) {
    return (await this.checkedAchievements(userId)).flatMap((row) => (row.seen ? [] : [{ id: row.achievementId, earnedAt: row.earnedAt }]))
  }

  /**
   * Has every player checked again, quietly, once the medals on offer differ from the ones they were checked against.
   * Once per process, and before any check: a check ahead of it would announce every medal a player already held.
   */
  syncAchievementDefinitions() {
    this.definitionsSynced ??= this.repository.syncAchievementDefinitions(ACHIEVEMENT_DEFINITIONS).catch((error: unknown) => {
      this.definitionsSynced = null
      throw error
    })
    return this.definitionsSynced
  }

  private checkedAchievements(userId: string) {
    const running = this.achievementChecks.get(userId)
    if (running) return running
    const check = this.checkAchievements(userId).finally(() => this.achievementChecks.delete(userId))
    this.achievementChecks.set(userId, check)
    return check
  }

  private async checkAchievements(userId: string): Promise<AchievementRows> {
    await this.syncAchievementDefinitions()
    // A finished battle reaches a player's revision only once the refresh stores its result.
    await this.refreshStandings()
    const status = await this.repository.achievementStatus(userId)
    const known = (rows: typeof status.earned) =>
      rows.filter((row): row is AchievementRows[number] => ACHIEVEMENT_IDS.has(row.achievementId))
    if (status.revision === status.checked) return known(status.earned)
    // Read after the revision, so a write landing during the check leaves the player to be checked again.
    const { earned } = await this.earnedAchievements(userId)
    const saved = await this.repository.saveAchievements({
      userId,
      revision: status.revision,
      definitions: ACHIEVEMENT_DEFINITIONS,
      earned: Object.entries(earned).map(([achievementId, earnedAt]) => ({ achievementId, earnedAt: earnedAt ?? null })),
    })
    return known(saved ? (await this.repository.achievementStatus(userId)).earned : status.earned)
  }

  /**
   * What a player has earned, from their stored battle results and the facts the module reads.
   *
   * A tournament's winner is the top of the table its results page shows, read as an entrant so a private one counts.
   */
  private async earnedAchievements(userId: string) {
    const factionsById = byId(await this.battleFactions())
    const [stored, practice, facts] = await Promise.all([
      this.repository.battleResultsByUser(userId),
      this.repository.practiceOpponentIds(),
      this.repository.achievementFacts(userId),
    ])
    const signups = new Map(
      await Promise.all(
        [...new Set(facts.recruits.map((claim) => claim.userId))].map(
          async (id) => [id, (await this.repository.userById(id))?.createdAt.getTime()] as const,
        ),
      ),
    )
    const recruits = facts.recruits.flatMap((claim) => {
      const signedUpAt = signups.get(claim.userId)
      return signedUpAt === undefined ? [] : [{ ...claim, signedUpAt }]
    })
    const tournaments = await Promise.all(
      facts.tournaments.map(async ({ token, eventToken, ...tournament }) => {
        const table = tournament.played
          ? await this.sealedEventResultsService.sealedEventResults(token, eventToken, undefined, [], userId)
          : null
        return { ...tournament, won: Boolean(table && !table.partial && table.swiss?.[0]?.userId === userId) }
      }),
    )
    return achievements(
      userId,
      { ...facts, battles: stored.map((row) => storedBattle(row, factionsById)), recruits, tournaments },
      practice,
    )
  }

  /** How far one battle moved each player's overall rating, or null when the leaderboard does not count it. */
  async battleRatingChanges(token: string) {
    await this.refreshStandings()
    return (await this.repository.ratingChanges([token]))[0]?.changes ?? null
  }
}
