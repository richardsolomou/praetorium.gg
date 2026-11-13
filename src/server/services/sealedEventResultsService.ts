import { battleFilterActive, type BattleFilter, type BattleOrder } from '../../core/battleFilter'
import { battleOutcome, sideScore, type StandingBattle } from '../../core/standings'
import { swissPairings, swissStandings, type SwissMatch } from '../../core/swiss'
import { SEALED_EVENT_RESULTS_BATTLE_LIMIT, sealedEventResults } from '../../core/sealedEventResults'
import type { BattlesCursor } from '../../contracts/battles'
import type { BattleFaction } from '../../shared/battleSummary'
import type { Notifier } from '../pushNotifier'
import type { BattleMissionRules } from '../rules'
import type { RepositoryPort } from '../spacetimeRepository'
import type { BattleFeedService } from './battleFeedService'
import { foldHistory, mayWatch, mustFindBattle } from './battleHistory'
import type { SealedEventService } from './sealedEventService'

export class SealedEventResultsService {
  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly notifier: Notifier,
    private readonly sealedEventService: SealedEventService,
    private readonly battleFeedService: BattleFeedService,
  ) {}

  async sealedEventBattles(
    sealedEventToken: string,
    eventToken: string,
    page: { limit: number; before?: BattlesCursor; filter?: BattleFilter; order?: BattleOrder },
    rules?: BattleMissionRules | null,
    factions?: readonly BattleFaction[],
    viewerId: string | null = null,
  ) {
    if (battleFilterActive(page.filter))
      return this.battleFeedService.filteredFeed(
        async (read) => {
          const found = await this.repository.battlesBySealedEvent(sealedEventToken, eventToken, { ...read, viewerId })
          return { ...found, battles: found.battles.filter((history) => mayWatch(history)) }
        },
        page,
        viewerId,
        rules,
        factions,
      )
    const { battles: histories, nextCursor } = await this.repository.battlesBySealedEvent(sealedEventToken, eventToken, {
      ...page,
      viewerId,
    })
    return {
      battles: this.battleFeedService.battleSummaries(
        histories.filter((history) => mayWatch(history)),
        viewerId,
        rules,
        factions,
      ),
      nextCursor,
    }
  }

  /** A revealed event's results table and who has met whom, from the battles this reader may watch. */
  async sealedEventResults(
    sealedEventToken: string,
    eventToken: string,
    rules?: BattleMissionRules | null,
    factions?: readonly BattleFaction[],
    viewerId: string | null = null,
  ) {
    const sealedEvent = await this.sealedEventService.sealedEvent(sealedEventToken, viewerId, eventToken)
    if (!sealedEvent?.revealedAt) return null
    const { battles, nextCursor } = await this.sealedEventBattles(
      sealedEventToken,
      eventToken,
      { limit: SEALED_EVENT_RESULTS_BATTLE_LIMIT },
      rules,
      factions,
      viewerId,
    )
    const entrantIds = sealedEvent.entries.filter((entry) => entry.status === 'accepted').map((entry) => entry.userId)
    return {
      ...sealedEventResults(entrantIds, battles),
      swiss:
        sealedEvent.rounds === null
          ? null
          : swissStandings(
              entrantIds,
              swissMatches(sealedEvent.pairings, battles),
              droppedIds(sealedEvent.entries),
              sealedEvent.scheduleFirst,
            ),
      partial: nextCursor !== null,
    }
  }

  /** Pairs the next Swiss round from the results so far. */
  async pairSealedEventRound(sealedEventToken: string, eventToken: string | undefined, userId: string) {
    const sealedEvent = await this.sealedEventService.sealedEvent(sealedEventToken, userId, eventToken)
    if (!sealedEvent) throw new Response('no such tournament', { status: 404 })
    if (sealedEvent.rounds === null || !sealedEvent.revealedAt) throw new Response('pair rounds once the rosters are out', { status: 409 })
    const { battles, nextCursor } = await this.sealedEventBattles(
      sealedEventToken,
      sealedEvent.eventToken,
      { limit: SEALED_EVENT_RESULTS_BATTLE_LIMIT },
      null,
      [],
      userId,
    )
    // A battle past the read limit would read as unplayed and skew every score the pairing depends on.
    if (nextCursor !== null) throw new Response('this tournament has too many battles to pair its next round', { status: 409 })
    const players = sealedEvent.entries.filter((entry) => entry.status === 'accepted' && entry.submitted).map((entry) => entry.userId)
    const matches = swissMatches(sealedEvent.pairings, battles)
    const round = Math.max(0, ...sealedEvent.pairings.map((pairing) => pairing.round)) + 1
    const result = await this.repository.pairSealedEventRound({
      token: sealedEventToken,
      eventToken: sealedEvent.eventToken,
      ownerId: userId,
      round,
      pairs: swissPairings(players, matches, Math.random, droppedIds(sealedEvent.entries)),
    })
    if (result === 'paired') {
      this.notifier.notify([
        {
          kind: 'sealed-event-round-paired',
          actorId: userId,
          recipientIds: players,
          sealedEventToken,
          eventToken: sealedEvent.eventToken,
          round,
        },
      ])
      return { round }
    }
    if (result === 'forbidden') throw new Response('only the organizer pairs rounds', { status: 403 })
    if (result === 'not-ready') throw new Response('every table must finish its battle before the next round', { status: 409 })
    if (result === 'missing') throw new Response('no such tournament', { status: 404 })
    throw new Response('the round changed while it was being paired; try again', { status: 409 })
  }

  /**
   * Reopens a finished Swiss table for one of its event's organizers, who need not have played it, so its players can
   * correct the result. The standings follow the corrected result; no round is paired again.
   */
  async reopenSwissTable(sealedEventToken: string, eventToken: string | undefined, battleToken: string, userId: string) {
    const sealedEvent = await this.sealedEventService.sealedEvent(sealedEventToken, userId, eventToken)
    if (!sealedEvent) throw new Response('no such tournament', { status: 404 })
    if (!sealedEvent.organizer) throw new Response('only the organizer can reopen a result', { status: 403 })
    if (!sealedEvent.pairings.some((pairing) => pairing.battleToken === battleToken))
      throw new Response('no such table in this tournament', { status: 404 })
    const history = await mustFindBattle(this.repository, battleToken)
    const { result } = await this.repository.submit({
      battleId: history.battle.id,
      userId,
      expectedSeq: foldHistory(history).seq,
      command: { kind: 'reopen-battle' },
      now: this.clock(),
      snapshot: { seats: history.players, log: history.log },
      organizer: true,
    })
    return { battleId: history.battle.id, result }
  }

  /** Records a table's final score. A table nobody has started gets its battle now, seated as the pairing is. */
  async reportTableResult(
    sealedEventToken: string,
    eventToken: string | undefined,
    round: number,
    table: number,
    vp: [number, number],
    missionPackId: string | null,
    userId: string,
  ) {
    const sealedEvent = await this.sealedEventService.sealedEvent(sealedEventToken, userId, eventToken)
    if (!sealedEvent) throw new Response('no such tournament', { status: 404 })
    const pairing = sealedEvent.pairings.find((candidate) => candidate.round === round && candidate.table === table)
    if (!pairing?.bId) throw new Response('no such table in this tournament', { status: 404 })
    if (!sealedEvent.organizer && userId !== pairing.aId && userId !== pairing.bId)
      throw new Response('only the organizer or the table’s players can report its score', { status: 403 })
    const token =
      pairing.battleToken ??
      (
        await this.sealedEventService.createSealedEventBattle(
          pairing.aId,
          sealedEventToken,
          pairing.bId,
          missionPackId,
          sealedEvent.eventToken,
        )
      ).token
    const history = await mustFindBattle(this.repository, token)
    const { result } = await this.repository.submit({
      battleId: history.battle.id,
      userId,
      expectedSeq: foldHistory(history).seq,
      command: { kind: 'report-result', vp: { [pairing.aId]: vp[0], [pairing.bId]: vp[1] } },
      now: this.clock(),
      snapshot: { seats: history.players, log: history.log },
      organizer: sealedEvent.organizer,
    })
    if (result.outcome === 'refused') throw new Response(result.reason, { status: 409 })
    if (result.outcome === 'stale') throw new Response('the battle changed while the score was being saved, so try again', { status: 409 })
  }
}

const droppedIds = (entries: readonly { userId: string; dropped: boolean }[]) =>
  new Set(entries.filter((entry) => entry.dropped).map((entry) => entry.userId))

/** Each paired table as a Swiss result, read from the battle it started; a table still playing has no outcome yet. */
export function swissMatches(
  pairings: readonly { round: number; aId: string; bId: string | null; battleToken: string | null }[],
  battles: readonly (StandingBattle & { token: string })[],
): SwissMatch[] {
  const byToken = new Map(battles.map((battle) => [battle.token, battle]))
  return pairings.map((pairing) => {
    const battle = pairing.battleToken ? byToken.get(pairing.battleToken) : undefined
    if (!pairing.bId || battle?.status !== 'finished')
      return { round: pairing.round, a: pairing.aId, b: pairing.bId, outcome: null, vp: [0, 0] }
    const sideA = battle.sides[battle.playerIds.indexOf(pairing.aId)] ?? 0
    const sideB = battle.sides[battle.playerIds.indexOf(pairing.bId)] ?? 1
    const outcome = battleOutcome(battle, sideA)
    return {
      round: pairing.round,
      a: pairing.aId,
      b: pairing.bId,
      outcome: outcome === 'won' ? 'a' : outcome === 'lost' ? 'b' : 'draw',
      vp: [sideScore(battle, sideA), sideScore(battle, sideB)],
    }
  })
}
