import { createHash, randomUUID } from 'node:crypto'
import { reduceBattle } from '../core/battle'
import { byId } from '../core/collections'
import { battleFoldArgs } from '../core/offlineBattle'
import { counted, newcomer, OVERALL, rateBattle, shownRating, type Rated, type StandingBattle } from '../core/standings'
import { battleResultSchema, type BattleResult, type StandingStep } from '../contracts/battleResults'
import { battleSummary, builtFaction, type BattleFaction } from '../shared/battleSummary'
import type { BattleHistory, RepositoryPort } from './spacetimeRepository'
import { rating } from 'openskill'

/** Raise when what a stored result holds changes: the next refresh rereads every battle's log. */
const RESULTS_VERSION = '1'
/** Raise when how a battle moves a rating changes: the next refresh replays every rating. */
const RATINGS_VERSION = '1'
/** As many battles as one read or write carries. */
const BATCH = 500
const RESULT_PAGE = 5_000
const STEP_WRITE = 2_000

type StoredResult = { battleId: string; finishedAt: number; result: string }

/** A stored result as the leaderboard and achievements read a finished battle, its armies named from `factionsById`. */
export function storedBattle({ battleId, finishedAt, result }: StoredResult, factionsById: ReadonlyMap<string, BattleFaction>) {
  const stored = battleResultSchema.parse(JSON.parse(result))
  return {
    battleId,
    token: stored.token,
    status: 'finished',
    playerIds: stored.playerIds,
    players: stored.playerIds.map(() => ''),
    sides: stored.sides,
    scores: stored.scores,
    factions: stored.built.map((built) => builtFaction(built ?? undefined, factionsById)),
    result: { concededBy: stored.concededBy },
    lastActivity: finishedAt,
    settings: { manual: stored.manual },
  } satisfies StandingBattle & { battleId: string; token: string }
}

/**
 * Keeps `battle_results` and the ratings caught up with the battles, reading only what `battle_changes` names.
 *
 * A battle that finishes after every rated one moves only its own seats. A change to an older one replays every rating
 * from its finish on, starting each player from the step they held just before it. One server refreshes at a time;
 * another finds it busy and reads what is stored, which the refresh's own standings signal then refreshes.
 */
export class StandingsRefresh {
  private readonly holder = randomUUID()
  private running: Promise<string> | null = null
  private queued: Promise<string> | null = null

  constructor(
    private readonly repository: Pick<
      RepositoryPort,
      | 'claimStandingsRefresh'
      | 'battleChanges'
      | 'battlesByIds'
      | 'saveBattleResults'
      | 'battleResultsAfter'
      | 'ratingsBefore'
      | 'saveRatingSteps'
      | 'finishStandingsRefresh'
      | 'practiceOpponentIds'
    >,
    /**
     * The catalogue's armies, which name each army's table. Read here rather than from a caller, so the ratings are always
     * derived from the same armies; a catalogue that names them differently, or loads after a refresh without one, replays them.
     */
    private readonly factions: () => Promise<readonly BattleFaction[]>,
  ) {}

  /** Shares a refresh this process already has running. Answers the standings revision, which rises whenever the leaderboard may have changed. */
  refresh(): Promise<string> {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = null
      })
      return this.running
    }
    // A run already going may have read the changes before this caller's, so the caller waits for one more after it.
    this.queued ??= this.running
      .catch(() => undefined)
      .then(() => {
        this.queued = null
        return this.refresh()
      })
    return this.queued
  }

  private async run() {
    const factions = await this.factions()
    const ratings = ratingsVersion(factions)
    const claim = await this.repository.claimStandingsRefresh(this.holder, RESULTS_VERSION, ratings)
    if (claim.state !== 'claimed') return String(claim.standings)
    let { ratingsFrom, replays } = claim
    let changed = false
    const { cursor, battleIds } = await this.repository.battleChanges(claim.cursor)
    for (let at = 0; at < battleIds.length; at += BATCH) {
      const ids = battleIds.slice(at, at + BATCH)
      const results = (await this.repository.battlesByIds(ids)).flatMap((history) => storedResult(history) ?? [])
      const found = new Set(results.map((row) => row.battleId))
      const saved = await this.repository.saveBattleResults({ holder: this.holder, results, removed: ids.filter((id) => !found.has(id)) })
      ;({ ratingsFrom, replays } = saved)
      changed ||= saved.changed
    }
    if (ratingsFrom !== null) await this.replay(ratingsFrom, factions)
    return this.repository.finishStandingsRefresh({
      holder: this.holder,
      cursor,
      seen: claim.standings,
      results: RESULTS_VERSION,
      ratings,
      replayed: ratingsFrom !== null,
      replays,
      changed,
    })
  }

  private async replay(from: number, factions: readonly BattleFaction[]) {
    const factionsById = byId(factions)
    const stored: StoredResult[] = []
    for (let after = { at: from, id: '' }; ;) {
      const page = await this.repository.battleResultsAfter(after.at, after.id, RESULT_PAGE)
      stored.push(...page)
      const last = page.at(-1)
      if (!last || page.length < RESULT_PAGE) break
      after = { at: last.finishedAt, id: last.battleId }
    }
    const battles = counted(
      stored.map((row) => storedBattle(row, factionsById)),
      await this.repository.practiceOpponentIds(),
    )
    const held = new Map<string, Rated>()
    const playerIds = [...new Set(battles.flatMap((battle) => battle.playerIds))]
    for (let at = 0; at < playerIds.length; at += BATCH)
      for (const step of await this.repository.ratingsBefore(from, playerIds.slice(at, at + BATCH)))
        held.set(JSON.stringify([step.table, step.playerId]), {
          skill: rating({ mu: step.mu, sigma: step.sigma }),
          row: { ...newcomer(step.playerId).row, ...step, id: step.playerId, lastPlayed: step.finishedAt },
        })
    const steps: StandingStep[] = []
    for (const battle of battles) {
      const moved = new Map<string, { table: string; seat: number; rated: Rated }>()
      const changes = rateBattle(battle, (table, seat) => {
        const key = JSON.stringify([table, battle.playerIds[seat]])
        const rated = held.get(key) ?? newcomer(battle.playerIds[seat]!)
        held.set(key, rated)
        moved.set(key, { table, seat, rated })
        return rated
      })
      for (const { table, seat, rated } of moved.values()) {
        const { battles: played, won, lost, drawn, points } = rated.row
        steps.push({
          table,
          playerId: rated.row.id,
          battleId: battle.battleId,
          finishedAt: battle.lastActivity,
          mu: rated.skill.mu,
          sigma: rated.skill.sigma,
          rating: shownRating(rated.skill),
          change: table === OVERALL ? changes[seat]! : 0,
          battles: played,
          won,
          lost,
          drawn,
          points,
        })
      }
    }
    for (let at = 0; at === 0 || at < steps.length; at += STEP_WRITE)
      await this.repository.saveRatingSteps({ holder: this.holder, from, first: at === 0, steps: steps.slice(at, at + STEP_WRITE) })
  }
}

/** Ratings name each army's table from the catalogue, so a catalogue that names armies differently replays them. */
function ratingsVersion(factions: readonly BattleFaction[]) {
  if (!factions.length) return `${RATINGS_VERSION}:`
  const armies = factions.map(({ id, displayName }) => [id, displayName]).toSorted(([one], [other]) => one!.localeCompare(other!))
  return `${RATINGS_VERSION}:${createHash('sha256').update(JSON.stringify(armies)).digest('hex').slice(0, 16)}`
}

function storedResult(history: BattleHistory): StoredResult | null {
  const state = reduceBattle(...battleFoldArgs(history.players, history.log))
  if (state.status !== 'finished') return null
  const summary = battleSummary(history, state, null, null, new Map())
  const result: BattleResult = {
    token: summary.token,
    playerIds: summary.playerIds,
    sides: summary.sides,
    scores: summary.scores,
    concededBy: summary.result?.concededBy ?? null,
    manual: Boolean(summary.settings.manual),
    built: state.players.map((player) =>
      player.roster?.built ? { catalogueId: player.roster.built.catalogueId, edition: player.roster.built.edition } : null,
    ),
  }
  return { battleId: history.battle.id, finishedAt: summary.lastActivity, result: JSON.stringify(result) }
}
