import { byId, chunks } from '../../core/collections'
import { battleFilterActive, matchesBattle, type BattleFilter, type BattleOrder } from '../../core/battleFilter'
import { periodBounds } from '../../core/listFilter'
import { playedArmies, type PlayedArmy } from '../../core/playedArmies'
import { battleDigest } from '../../core/battleDigest'
import type { RosterPick } from '../../core/roster'
import type { BattlesCursor } from '../../contracts/battles'
import { battleSummary, type BattleFaction } from '../../shared/battleSummary'
import type { BattleMissionRules } from '../rules'
import type { StandingsRefresh } from '../standingsRefresh'
import type { BattleCard, RepositoryPort } from '../spacetimeRepository'
import { foldHistory, mayWatch } from './battleHistory'

/** A page of the battle list. History grows for an account's lifetime; a page does not. */
export const BATTLES_PAGE = 25
/** A page of a home-page feed. Small: every row on it costs a folded log, and the page shows three at once. */
const PUBLIC_BATTLES_PAGE = 10
const PLAYED_ARMY_BATTLES = 12
/** How far one filtered read walks a feed: enough to fill a page for most filters without tying up the product database. */
const FILTER_SCAN_BATTLES = 50
const FILTER_SCAN_PAGES = 6
/** How long one public feed page serves repeated reads, such as a burst of tabs refetching after the same signal. */
const PUBLIC_FEED_HOLD_MS = 5_000
const PUBLIC_FEED_HELD_PAGES = 200
/** How long one walk of the played armies serves every reader's counts; they move only as battles finish. */
const PLAYED_COUNTS_HOLD_MS = 60_000
/** The most public battles Played counts walk, in the feed's largest pages; past it the counts are left out rather than undercounted. */
const PLAYED_COUNT_BATTLES = 500
const PLAYED_COUNT_PAGES = 20

export class BattleFeedService {
  private readonly publicFeedHeld = new Map<string, { until: number; page: Promise<unknown> }>()
  private playedArmiesHeld: { until: number; armies: Promise<{ seated: readonly string[]; army: PlayedArmy }[] | null> } | null = null

  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly standingsRefresh: StandingsRefresh,
  ) {}

  /**
   * A user's battles with their current state, read from each one's digest.
   *
   * The digests arrive with the seats, so the cost of this page does not grow by a
   * round trip for every battle the player has ever opened.
   */
  async battles(
    userId: string,
    rules?: BattleMissionRules | null,
    page?: { limit: number; before?: BattlesCursor; withUserId?: string; filter?: BattleFilter; order?: BattleOrder },
    factions?: readonly BattleFaction[],
  ) {
    if (battleFilterActive(page?.filter)) {
      const found = await this.filteredFeed((read) => this.repository.battlesByUser(userId, read), page, userId, rules, factions)
      return { ...found, battles: await this.withRatingChanges(found.battles) }
    }
    const { battles: histories, nextCursor } = await this.repository.battlesByUser(userId, page)
    return { battles: await this.withRatingChanges(this.battleSummaries(histories, userId, rules, factions)), nextCursor }
  }

  /**
   * The battles anyone may watch, for the home page.
   *
   * Read with no viewer, the same as a sealed event's list: a reader with no
   * seat is told what a spectator of any one of these would be told, and nothing
   * in a summary is hidden from a spectator anyway.
   */
  async publicBattles(
    viewerId: string | null,
    rules?: BattleMissionRules | null,
    page?: { limit?: number; before?: BattlesCursor; filter?: BattleFilter; order?: BattleOrder },
    factions?: readonly BattleFaction[],
  ) {
    const limit = page?.limit ?? PUBLIC_BATTLES_PAGE
    if (battleFilterActive(page?.filter))
      return this.filteredFeed((read) => this.heldPublicFeed(viewerId, read), { ...page, limit }, viewerId, rules, factions)
    const { battles: histories, nextCursor } = await this.heldPublicFeed(viewerId, { limit, before: page?.before, order: page?.order })
    return { battles: this.battleSummaries(histories, viewerId, rules, factions), nextCursor }
  }

  /** Anyone can ask for this signed out and with any search text, so every reader's scan shares the one held read of each page. */
  private heldPublicFeed(viewerId: string | null, page: { limit: number; before?: BattlesCursor; order?: BattleOrder }) {
    const now = this.clock()
    const key = JSON.stringify([viewerId, page.limit, page.before ?? null, page.order ?? null])
    const read = () => this.repository.publicBattles({ ...page, viewerId })
    const held = this.publicFeedHeld.get(key)
    if (held && held.until > now) return held.page as ReturnType<typeof read>
    const pending = read()
    this.publicFeedHeld.set(key, { until: now + PUBLIC_FEED_HOLD_MS, page: pending })
    pending.catch(() => this.publicFeedHeld.delete(key))
    for (const [heldKey, entry] of this.publicFeedHeld)
      if (entry.until <= now || this.publicFeedHeld.size > PUBLIC_FEED_HELD_PAGES) this.publicFeedHeld.delete(heldKey)
    return pending
  }

  /**
   * One page of a feed's matches, walking its stored order because whether a battle matches is only known from its digest.
   *
   * The walk is bounded, so a rare match can return a short or empty page; its cursor continues from where the walk stopped.
   * `perspective` is whose seat a result or "their army" is read from, which on a profile is its player's rather than the reader's.
   */
  async filteredFeed(
    read: (page: { limit: number; before?: BattlesCursor; order?: BattleOrder }) => Promise<{
      battles: BattleCard[]
      nextCursor: BattlesCursor | null
    }>,
    page: { limit?: number; before?: BattlesCursor; filter?: BattleFilter; order?: BattleOrder } | undefined,
    viewerId: string | null,
    rules?: BattleMissionRules | null,
    factions: readonly BattleFaction[] = [],
    perspective: string | null = viewerId,
  ) {
    const filter = page?.filter ?? {}
    const wanted = page!.limit ?? BATTLES_PAGE
    const now = this.clock()
    const bounds = periodBounds(filter, now)
    const factionsById = byId(factions)
    const kept: ReturnType<typeof battleSummary>[] = []
    const order = page!.order
    const edge = order === 'oldest' ? bounds.from : bounds.to
    let cursor = page!.before ?? (edge === undefined ? undefined : { at: edge, id: '' })
    const pastPeriod = (at: number) =>
      order === 'oldest' ? bounds.to !== undefined && at >= bounds.to : bounds.from !== undefined && at < bounds.from
    for (let walked = 0; walked < FILTER_SCAN_PAGES; walked++) {
      const { battles, nextCursor } = await read({ limit: FILTER_SCAN_BATTLES, before: cursor, order })
      for (const [index, history] of battles.entries()) {
        const summary = battleSummary(history, history.digest, viewerId, rules, factionsById)
        if (!matchesBattle(summary, filter, perspective, history.at, now)) continue
        kept.push(summary)
        if (kept.length === wanted)
          return { battles: kept, nextCursor: index < battles.length - 1 || nextCursor ? { at: history.at, id: history.battle.id } : null }
      }
      if (!nextCursor || pastPeriod(nextCursor.at)) return { battles: kept, nextCursor: null }
      cursor = nextCursor
    }
    return { battles: kept, nextCursor: cursor ?? null }
  }

  /**
   * The armies finished public battles fielded, read without the feed's hold. A filtered read keeps walking older
   * battles until it has a page of matches or reaches the walk's limit; its cursor continues either way.
   */
  async playedArmies(
    viewerId: string | null,
    before?: BattlesCursor,
    factions: readonly BattleFaction[] = [],
    accepts?: (armies: PlayedArmy[]) => PlayedArmy[] | Promise<PlayedArmy[]>,
  ) {
    const armies: PlayedArmy[] = []
    const factionsById = byId(factions)
    let cursor = before
    for (let walked = 0; walked < (accepts ? FILTER_SCAN_PAGES : 1); walked++) {
      const { battles: histories, nextCursor } = await this.repository.publicBattles({
        limit: PLAYED_ARMY_BATTLES,
        before: cursor,
        viewerId,
      })
      const fielded = histories.flatMap((card) =>
        playedArmies(card, card.digest, battleSummary(card, card.digest, null, null, factionsById)),
      )
      armies.push(...(accepts ? await accepts(fielded) : fielded))
      cursor = nextCursor ?? undefined
      if (!cursor || armies.length >= PLAYED_ARMY_BATTLES) break
    }
    return { armies, nextCursor: cursor ?? null }
  }

  /**
   * Every army the public battles fielded, read from their digests, for the Played tab's counts; null when there are
   * more battles than the walk reads. One walk serves every reader for a minute, less the battles a reader sat in,
   * which their own feed leaves out.
   */
  async everyPlayedArmy(viewerId: string | null, factions: readonly BattleFaction[] = []) {
    const now = this.clock()
    if (!this.playedArmiesHeld || this.playedArmiesHeld.until <= now) {
      const armies = this.walkPlayedArmies(factions)
      this.playedArmiesHeld = { until: now + PLAYED_COUNTS_HOLD_MS, armies }
      armies.catch(() => {
        if (this.playedArmiesHeld?.armies === armies) this.playedArmiesHeld = null
      })
    }
    const armies = await this.playedArmiesHeld.armies
    return armies && armies.flatMap(({ seated, army }) => (viewerId && seated.includes(viewerId) ? [] : [army]))
  }

  private async walkPlayedArmies(factions: readonly BattleFaction[]) {
    const factionsById = byId(factions)
    const armies: { seated: readonly string[]; army: PlayedArmy }[] = []
    let before: BattlesCursor | undefined
    for (let page = 0; page < PLAYED_COUNT_PAGES; page++) {
      const { battles, nextCursor } = await this.repository.publicBattles({ limit: PLAYED_COUNT_BATTLES, before, viewerId: null })
      for (const card of battles) {
        const seated = card.players.map((player) => player.id)
        for (const army of playedArmies(card, card.digest, battleSummary(card, card.digest, null, null, factionsById)))
          armies.push({ seated, army })
      }
      if (!nextCursor) return armies
      before = nextCursor
    }
    return null
  }

  /** One army from a finished battle with the picks it fielded, or nothing. */
  async playedArmy(token: string, playerId: string) {
    const history = await this.repository.battleHistoryByToken(token)
    if (!history || !mayWatch(history)) return null
    const state = foldHistory(history)
    const digest = battleDigest(state, history.log)
    const army = playedArmies(history, digest, battleSummary(history, digest, null, null, new Map())).find(
      (played) => played.player.id === playerId,
    )
    const picks = state.players.find((player) => player.id === playerId)?.roster?.built?.picks
    return army && picks ? { ...army, picks } : null
  }

  /** The picks each army fielded, read from its battle's log; only the armies a page prices need them. */
  async playedArmyPicks(armies: readonly PlayedArmy[]) {
    const tokens = [...new Set(armies.map((army) => army.battle))]
    const histories = await Promise.all(tokens.map((token) => this.repository.battleHistoryByToken(token)))
    const picks = new Map<string, RosterPick[]>()
    for (const history of histories) {
      if (!history) continue
      for (const player of foldHistory(history).players)
        if (player.roster?.built?.picks) picks.set(`${history.battle.token}:${player.id}`, player.roster.built.picks)
    }
    return armies.map((army) => picks.get(`${army.battle}:${army.player.id}`) ?? [])
  }

  /** The battles this player's friends are in and they are not. */
  async friendBattles(
    userId: string,
    rules?: BattleMissionRules | null,
    page?: { limit?: number; before?: BattlesCursor; filter?: BattleFilter; order?: BattleOrder },
    factions?: readonly BattleFaction[],
  ) {
    const limit = page?.limit ?? PUBLIC_BATTLES_PAGE
    if (battleFilterActive(page?.filter))
      return this.filteredFeed((read) => this.repository.battlesByFriends(userId, read), { ...page, limit }, userId, rules, factions)
    const { battles: histories, nextCursor } = await this.repository.battlesByFriends(userId, {
      limit,
      before: page?.before,
      order: page?.order,
    })
    return { battles: this.battleSummaries(histories, userId, rules, factions), nextCursor }
  }

  /** Each battle with how far it moved each player's overall rating, from the leaderboard's stored ratings. */
  async withRatingChanges<T extends { token: string; status: string }>(
    battles: T[],
  ): Promise<(T & { ratingChanges?: Readonly<Record<string, number>> })[]> {
    const finished = battles.flatMap((battle) => (battle.status === 'finished' ? [battle.token] : []))
    if (finished.length) await this.standingsRefresh.refresh()
    const changes = new Map<string, Readonly<Record<string, number>>>()
    for (const batch of chunks(finished, 500))
      for (const row of await this.repository.ratingChanges(batch)) changes.set(row.token, row.changes)
    return battles.map((battle) => {
      const ratingChanges = changes.get(battle.token)
      return ratingChanges ? { ...battle, ratingChanges } : battle
    })
  }

  battleSummaries(
    histories: readonly BattleCard[],
    viewerId: string | null,
    rules?: BattleMissionRules | null,
    factions: readonly BattleFaction[] = [],
  ) {
    const factionsById = byId(factions)
    return histories.map((history) => battleSummary(history, history.digest, viewerId, rules, factionsById))
  }
}
