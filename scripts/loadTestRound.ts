import type { ChildProcess } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { reduceBattle, type Command, type Roster } from '../src/core/battle'
import { GROUP_LEAGUE_PLAYERS_MAX, leagueDraw } from '../src/core/groupLeague'
import { battleFoldArgs } from '../src/core/offlineBattle'
import { SEALED_EVENT_MEMBER_MAX } from '../src/core/sealedEvent'
import { user } from '../src/db/authSchema'
import { SqliteAccountRepository } from '../src/server/accountRepository'
import { localAuthDatabase } from '../src/server/localAuthDatabase'
import { rosterRow } from '../src/server/rosterPersistence'
import { PraetoriumService } from '../src/server/service'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { SpacetimeRepository } from '../src/server/spacetimeRepository'
import { buildSealedEventBattle } from '../src/shared/sealedEventBattle'
import { startLocalChild, stopLocalChildren } from './lib/localStack.ts'
import { startThrowawaySpacetime } from './lib/throwawaySpacetime.ts'
import { importAuthSqlite } from './nodeAuthSqlite'
import { PREVIEW_ACCOUNTS } from './seedPreview'

/*
 * Times the end of a busy round against a throwaway SpacetimeDB: every table reports its result, then opens its battle's
 * rating changes, while every player reads the standings, all through one in-process service as one server would serve
 * them. It measures the service and SpacetimeDB, not page rendering; signed-out page loads queue behind
 * `publicPageLoad` first, so every reader here is signed in.
 *
 * `tournament` reports Swiss tables through `reportTableResult` and reads `sealedEventResults`; `league` finishes a group
 * league's fixtures and reads `groupStandings` and `groupLeague`. Rounds before the timed one are seeded finished, so the
 * reads fold a table's worth of history. Prints one JSON line per scenario and operation.
 */
const { values } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'all' },
    tables: { type: 'string', default: '16' },
    played: { type: 'string', default: '3' },
    reads: { type: 'string', default: '1' },
  },
})
const scenarios = values.scenario === 'all' ? ['tournament', 'league'] : [values.scenario]
const tables = Number(values.tables)
const played = Number(values.played)
const reads = Number(values.reads)
if (
  scenarios.some((scenario) => scenario !== 'tournament' && scenario !== 'league') ||
  ![tables, played, reads].every(Number.isInteger) ||
  tables < 1 ||
  played < 0 ||
  reads < 1
)
  throw new Error('Usage: pnpm exec tsx scripts/loadTestRound.ts [--scenario tournament|league|all] [--tables 16] [--played 3] [--reads 1]')
if (scenarios.includes('league') && 2 * tables > GROUP_LEAGUE_PLAYERS_MAX)
  throw new Error(`A league seats at most ${GROUP_LEAGUE_PLAYERS_MAX / 2} tables`)
if (2 * tables > SEALED_EVENT_MEMBER_MAX) throw new Error(`A tournament seats at most ${SEALED_EVENT_MEMBER_MAX / 2} tables`)

const database = 'praetorium-load'
const abort = new AbortController()
const children: ChildProcess[] = []
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => abort.abort(new Error(`Stopped by ${signal}`)))

const fixtures = PREVIEW_ACCOUNTS.flatMap((account) => account.rosters).filter((roster) => roster.limit === 2_000)
const players = Array.from({ length: 2 * tables }, (_, index) => `load-player-${index + 1}`)
// The league draws the same circle method, so the tournament's seeded rounds never repeat a pairing either.
const draw = leagueDraw(players, 1) as [string, string][][]
if (played + 1 > draw.length) throw new Error(`--played stays below ${draw.length} with ${tables} tables`)
let clock = Date.now()
const now = () => ++clock

/** A one-unit snapshot, as the SpacetimeDB seed test seals, so no catalogue is needed. */
function snapshot(playerIndex: number): Roster {
  const fixture = fixtures[playerIndex % fixtures.length]!
  const id = `load-roster-${playerIndex + 1}`
  return {
    id,
    name: fixture.name,
    text: `${fixture.limit} pts`,
    built: {
      catalogueId: fixture.catalogueId,
      revision: 'load-test',
      limit: fixture.limit,
      detachment: null,
      disposition: fixture.disposition,
      units: [
        { key: `${id}-character`, name: 'Warlord', points: 100, models: 1, group: 'character', warlord: true, warlordEligible: true },
      ],
    },
  }
}

/** A table's battle: finished in a seeded round, still under way in the timed one. */
function battleTail(aId: string, bId: string, table: number, round: number): Command[] {
  return [
    { kind: 'begin-battle', firstPlayerId: aId },
    { kind: 'score', category: 'primary', delta: 60 + (table % 20), playerId: aId },
    { kind: 'score', category: 'primary', delta: 40 + (table % 15), playerId: bId },
    ...(round > played ? [] : [{ kind: 'end-battle' as const, reason: 'conceded' as const, concededBy: table % 3 ? bId : aId }]),
  ]
}

function percentile(sorted: readonly number[], fraction: number) {
  return Math.round(sorted[Math.ceil(fraction * sorted.length) - 1]!)
}

async function measure(
  scenario: string,
  work: (timed: <T>(operation: string, run: () => Promise<T>) => Promise<T | undefined>) => Promise<unknown>,
) {
  const samples = new Map<string, { durations: number[]; failures: number; failure?: string }>()
  const timed = async <T>(operation: string, run: () => Promise<T>) => {
    const sample = samples.get(operation) ?? { durations: [], failures: 0 }
    samples.set(operation, sample)
    const started = performance.now()
    try {
      const result = await run()
      sample.durations.push(performance.now() - started)
      return result
    } catch (error) {
      sample.durations.push(performance.now() - started)
      sample.failures++
      sample.failure ??= error instanceof Response ? `HTTP ${error.status}: ${await error.text()}` : String(error)
      return undefined
    }
  }
  const started = performance.now()
  await work(timed)
  console.log(JSON.stringify({ scenario, tables, played, reads, burstMs: Math.round(performance.now() - started) }))
  for (const [operation, { durations, failures, failure }] of samples) {
    const sorted = durations.toSorted((one, other) => one - other)
    console.log(
      JSON.stringify({
        scenario,
        operation,
        count: sorted.length,
        failures,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        maxMs: percentile(sorted, 1),
      }),
    )
    if (failure) console.error(`${scenario} ${operation} failed: ${failure}`)
  }
}

const worktree = await realpath(process.cwd())
const root = await mkdtemp(path.join(await realpath(tmpdir()), 'praetorium-load-'))
const sqlitePath = path.join(root, 'auth.sqlite')
let local: ReturnType<typeof localAuthDatabase> | undefined
try {
  const { url, operatorToken } = await startThrowawaySpacetime({
    root,
    worktree,
    database,
    launch: (command, args, kind) => {
      // The server logs every procedure call, which would drown the results; the build's output goes to stderr.
      const child = startLocalChild(command, args, process.env, kind === 'server' ? 'ignore' : ['ignore', process.stderr, process.stderr])
      children.push(child)
      return child
    },
    abort,
  })
  await importAuthSqlite(path.resolve('drizzle-auth/0000_curly_gambit.sql'), sqlitePath)
  local = localAuthDatabase(sqlitePath)
  const repository = new SpacetimeRepository(
    new SqliteAccountRepository(local.database),
    new SpacetimeOperator(url, database, operatorToken),
  )

  for (const [index, id] of players.entries()) {
    const created = new Date()
    await local.database.insert(user).values({
      id,
      name: `Load Player ${index + 1}`,
      email: `${id}@praetorium.invalid`,
      emailVerified: false,
      createdAt: created,
      updatedAt: created,
    })
    const fixture = fixtures[index % fixtures.length]!
    await repository.saveRoster({
      ...rosterRow({ ...fixture, id: `load-roster-${index + 1}`, prep: null }),
      userId: id,
      visibility: 'private',
      source: 'editable',
      now: now(),
    })
  }

  for (const scenario of scenarios) {
    const service = new PraetoriumService(repository, Date.now, () => 0)
    if (scenario === 'tournament') {
      const token = 'load-tournament'
      const eventToken = 'load-tournament-event'
      const owner = players[0]!
      const created = await repository.createTournament({
        id: token,
        token,
        eventId: eventToken,
        eventToken,
        ownerId: owner,
        name: 'Load Test Swiss',
        description: '',
        visibility: 'public',
        admission: 'automatic',
        playerLimit: players.length,
        format: '1v1',
        rosterLimit: 2_000,
        rounds: played + 1,
        now: now(),
      })
      if (created) throw new Error(`The tournament could not be created: ${created}`)
      for (const [index, id] of players.entries()) {
        await repository.joinSealedEvent(token, id, now(), SEALED_EVENT_MEMBER_MAX, eventToken)
        const saved = (await repository.roster(`load-roster-${index + 1}`))!
        const sealed = await repository.submitSealedEventRoster({
          token,
          eventToken,
          userId: id,
          rosterId: saved.id,
          rosterName: saved.name,
          rosterLimit: saved.limit,
          rosterUpdatedAt: saved.updatedAt,
          snapshot: JSON.stringify(snapshot(index)),
          now: now(),
        })
        if (sealed.outcome !== 'sealed') throw new Error(`${id} could not seal: ${sealed.outcome}`)
      }
      const reveal = await repository.revealSealedEvent(token, owner, now(), eventToken)
      if (reveal.outcome !== 'revealed') throw new Error(`The tournament could not be revealed: ${reveal.outcome}`)
      for (let round = 1; round <= played + 1; round++) {
        const pairs = draw[round - 1]!
        const paired = await repository.pairSealedEventRound({ token, eventToken, ownerId: owner, round, pairs })
        if (paired !== 'paired') throw new Error(`Round ${round} could not be paired: ${paired}`)
        for (const [table, [aId, bId]] of pairs.entries()) {
          const battleToken = `load-tournament-${round}-${table + 1}`
          await repository.createSealedEventBattle(
            { id: battleToken, token: battleToken, sealedEventToken: token, eventToken, userId: aId, userIds: [aId, bId], now: now() },
            (setup) => {
              const built = buildSealedEventBattle(setup, aId, bId, null, battleToken)
              return { ...built, initialCommands: [...built.initialCommands, ...battleTail(aId, bId, table, round)] }
            },
          )
        }
      }
      // A running server has already refreshed the ratings and read the table, so the burst times only this round's change.
      await service.refreshStandings()
      await service.sealedEventResults(token, eventToken, null, [], owner)
      const pairings = (await repository.sealedEventByToken(token, owner, eventToken))!.pairings.filter(
        (pairing) => pairing.round === played + 1,
      )
      await measure(scenario, (timed) =>
        Promise.all([
          ...pairings.map(async (pairing, index) => {
            await timed('report result', () =>
              service.reportTableResult(token, eventToken, pairing.round, pairing.table, [70, 50 + (index % 20)], null, pairing.aId),
            )
            await timed('rating changes', () => service.battleRatingChanges(pairing.battleToken!))
          }),
          ...Array.from({ length: reads }, () =>
            players.map((id) => timed('tournament results', () => service.sealedEventResults(token, eventToken, null, [], id))),
          ).flat(),
        ]),
      )
    } else {
      const token = 'load-group'
      const owner = players[0]!
      await repository.createGroup({
        id: token,
        token,
        ownerId: owner,
        name: 'Load Test Group',
        description: '',
        visibility: 'public',
        admission: 'automatic',
        now: now(),
      })
      for (const id of players.slice(1)) {
        const joined = await repository.joinGroup(token, id, now())
        if (typeof joined !== 'object' || joined.status !== 'accepted') throw new Error(`${id} could not join the group`)
      }
      const drawn = await repository.drawGroupLeague(token, owner, { id: 'load-league', seed: 1, now: now() })
      if (drawn !== 'drawn') throw new Error(`The league could not be drawn: ${drawn}`)
      for (const id of players) {
        const joined = await repository.joinGroupLeague(token, id, now())
        if (joined !== 'joined') throw new Error(`${id} could not join the league: ${joined}`)
      }
      const published = await repository.publishGroupLeague(token, owner, { seed: 1, playerIds: players, now: now() })
      if (published !== 'published') throw new Error(`The league could not be published: ${published}`)
      const leagueFixtures = (await repository.groupByToken(token))!.league!.fixtures.filter(
        (fixture) => fixture.round <= played + 1 && fixture.bId !== null,
      )
      for (const fixture of leagueFixtures) {
        const [aId, bId] = [fixture.aId, fixture.bId!]
        const battleToken = `load-league-${fixture.round}-${fixture.table + 1}`
        await repository.createBattle({
          id: battleToken,
          token: battleToken,
          userId: aId,
          allyIds: [],
          opponentIds: [bId],
          initialCommands: [
            {
              kind: 'configure-battle',
              limit: 2_000,
              missionPackId: null,
              terrainLayoutId: null,
              twistId: null,
              teamBattle: false,
              playerCount: 2,
              clockLimitMinutes: null,
            },
            ...[aId, bId].map((playerId) => ({
              kind: 'attach-roster' as const,
              playerId,
              roster: snapshot(players.indexOf(playerId)),
              prep: null,
              painted: true,
            })),
            { kind: 'set-battle-group', groupId: token },
            ...battleTail(aId, bId, fixture.table, fixture.round),
          ],
          now: now(),
          fixtureKey: fixture.key,
        })
      }
      await service.refreshStandings()
      await service.groupStandings(token, owner, [])
      await service.groupLeague(token, owner, [])
      // Each table's sequence as its players' screens hold it before they end the battle.
      const timedRound = await Promise.all(
        leagueFixtures
          .filter((fixture) => fixture.round === played + 1)
          .map(async (fixture) => {
            const battleToken = `load-league-${fixture.round}-${fixture.table + 1}`
            const history = (await repository.battleHistoryByToken(battleToken))!
            return {
              token: battleToken,
              aId: fixture.aId,
              bId: fixture.bId!,
              seq: reduceBattle(...battleFoldArgs(history.players, history.log)).seq,
            }
          }),
      )
      await measure(scenario, (timed) =>
        Promise.all([
          ...timedRound.map(async (table) => {
            await timed('finish battle', async () => {
              const { result } = await service.submit(table.token, table.aId, table.seq, {
                kind: 'end-battle',
                reason: 'conceded',
                concededBy: table.bId,
              })
              if (result.outcome !== 'appended') throw new Error(`The battle refused its end: ${JSON.stringify(result)}`)
            })
            await timed('rating changes', () => service.battleRatingChanges(table.token))
          }),
          ...Array.from({ length: reads }, () =>
            players.flatMap((id) => [
              timed('group standings', () => service.groupStandings(token, id, [])),
              timed('group league', () => service.groupLeague(token, id, [])),
            ]),
          ).flat(),
        ]),
      )
    }
  }
} finally {
  local?.client.close()
  await stopLocalChildren(children)
  await rm(root, { recursive: true, force: true })
}
