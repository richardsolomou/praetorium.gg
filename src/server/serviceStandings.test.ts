import { expect, it, vi } from 'vitest'

// The test host stubs environment reads, so the module reads these instead.
const env = vi.hoisted((): Record<string, string> => ({}))
vi.mock('spacetime:sys@2.2', async (original) => ({ ...(await original<object>()), env_get: (key: string) => env[key] ?? null }))

import { reduceBattle, type Command } from '../core/battle'
import { ALICE, BOB, CAROL, builtRoster } from '../core/battle.fixtures'
import { byId } from '../core/collections'
import { battleFoldArgs } from '../core/offlineBattle'
import { standings } from '../core/standings'
import { battleSummary, type BattleFaction } from '../shared/battleSummary'
import { MODULE_URL, moduleFetch } from './moduleFetch.fixtures'
import { PraetoriumService } from './service'
import { SpacetimeOperator } from './spacetimeOperator'
import { SpacetimeRepository, type BattleHistory } from './spacetimeRepository'
import type { SqliteAccountRepository } from './accountRepository'

const DAVE = 'dave'
const NOW = Date.UTC(2026, 9, 1)
const FACTIONS: BattleFaction[] = [{ id: 'cat', slug: 'death-guard', displayName: 'Death Guard', icon: null }]

/** The product module in memory behind the real repository, with accounts named from `names`. */
function product() {
  const { request } = moduleFetch(env, 'https://praetorium.test/api/auth', NOW)
  const operator = new SpacetimeOperator(MODULE_URL, 'praetorium', 'operator', request)
  const names = new Map<string, string>()
  const accounts = {
    profilesByIds: async (ids: readonly string[]) => new Map(ids.map((id) => [id, { id, name: names.get(id) ?? id, image: null }])),
    userById: async () => undefined,
  } as unknown as SqliteAccountRepository
  const repository = new SpacetimeRepository(accounts, operator)
  const service = new PraetoriumService(
    repository,
    () => NOW,
    () => 0,
    undefined,
    async () => FACTIONS,
  )
  const ids: string[] = []
  const send = async (id: string, by: string, expectedSeq: number, command: Command, now: number) =>
    expect((await operator.submit({ battleId: id, userId: by, expectedSeq, command, now })).result.outcome).toBe('appended')
  /** A battle `loser` concedes to `winner`, its commands at `at`. */
  const conceded = async (id: string, winner: string, loser: string, at: number) => {
    ids.push(id)
    await operator.createBattle({ id, token: `${id}-token`, userId: winner, opponentIds: [loser], now: at })
    await send(id, winner, 0, builtRoster('Winner army', ['Plague Marines']), at)
    await send(id, loser, 1, builtRoster('Loser army', ['Plague Marines']), at)
    await send(id, winner, 2, { kind: 'begin-battle', firstPlayerId: winner }, at)
    await send(id, winner, 3, { kind: 'end-battle', reason: 'conceded', concededBy: loser }, at)
  }
  const reopen = (id: string, by: string, at: number) => send(id, by, 4, { kind: 'reopen-battle' }, at)
  /** Every battle still held, as the leaderboard would rate it from scratch. */
  const replay = async (exclude: string[] = []) => {
    const held: BattleHistory[] = await repository.battlesByIds(ids)
    return standings(
      held.map((history) =>
        battleSummary(
          { ...history, players: history.players.map((player) => ({ ...player, name: names.get(player.id) ?? player.name })) },
          reduceBattle(...battleFoldArgs(history.players, history.log)),
          null,
          null,
          byId(FACTIONS),
        ),
      ),
      { exclude, activeSince: NOW - 90 * 24 * 60 * 60 * 1000 },
    )
  }
  const tables = (answer: Awaited<ReturnType<typeof service.standings>>) => ({
    overall: answer.overall.rows,
    factions: answer.factions.map((table) => table.rows),
  })
  const replayed = (expected: Awaited<ReturnType<typeof replay>>) => ({
    overall: expected.overall,
    factions: expected.factions.map((table) => table.rows),
  })
  return { service, operator, names, conceded, reopen, replay, tables, replayed }
}

it('rates the same after changes as a full replay of every log', async () => {
  const { service, operator, names, conceded, reopen, replay, tables, replayed } = product()
  await conceded('one', ALICE, BOB, NOW - 4_000)
  await conceded('two', BOB, CAROL, NOW - 3_000)
  await conceded('three', CAROL, ALICE, NOW - 2_000)
  await service.standings()
  await reopen('one', ALICE, NOW - 1_000)
  await conceded('four', DAVE, ALICE, NOW)
  await operator.deleteBattle('two', BOB)
  names.set(CAROL, 'Caz')
  expect(tables(await service.standings())).toEqual(replayed(await replay()))
})

it('rates a battle finishing between rated ones the same as a full replay', async () => {
  const { service, conceded, replay, tables, replayed } = product()
  await conceded('one', ALICE, BOB, NOW - 4_000)
  await conceded('two', CAROL, ALICE, NOW - 2_000)
  await conceded('three', DAVE, ALICE, NOW)
  await service.standings()
  await conceded('between', BOB, DAVE, NOW - 1_000)
  expect(tables(await service.standings())).toEqual(replayed(await replay()))
})

it('places a player on their profile where the leaderboard lists them', async () => {
  const { service, conceded } = product()
  await conceded('one', ALICE, BOB, NOW - 2_000)
  await conceded('two', CAROL, ALICE, NOW - 1_000)
  const { overall } = await service.standings()
  expect((await service.playerRankings(ALICE)).overall?.place).toBe(overall.rows.findIndex((row) => row.id === ALICE) + 1)
})

it('shows how far a battle moved each rating as a full replay does', async () => {
  const { service, conceded, replay } = product()
  await conceded('one', ALICE, BOB, NOW - 1_000)
  await conceded('two', CAROL, ALICE, NOW)
  const [battle, change] = [...(await replay()).changes].find(([summary]) => summary.token === 'two-token')!
  expect(await service.battleRatingChanges('two-token')).toEqual(Object.fromEntries(battle.playerIds.map((id, seat) => [id, change[seat]])))
})

it('stops rating battles against a player once they are a practice opponent', async () => {
  const { service, operator, conceded, replay, tables, replayed } = product()
  await conceded('one', ALICE, BOB, NOW - 1_000)
  await conceded('two', DAVE, ALICE, NOW)
  await service.standings()
  await operator.registerPracticeOpponent(DAVE)
  expect(tables(await service.standings())).toEqual(replayed(await replay([DAVE])))
})

it('announces a medal earned in a battle', async () => {
  const { service, conceded } = product()
  await service.syncAchievementDefinitions()
  await conceded('one', ALICE, BOB, NOW)
  expect((await service.newAchievements(ALICE)).map((achievement) => achievement.id)).toContain('first-blood')
})

it('announces a medal once', async () => {
  const { service, conceded } = product()
  await service.syncAchievementDefinitions()
  await conceded('one', ALICE, BOB, NOW)
  await service.markAchievementsSeen(
    ALICE,
    (await service.newAchievements(ALICE)).map((achievement) => achievement.id),
  )
  expect(await service.newAchievements(ALICE)).toEqual([])
})

it('stores the medals a player held before medals were stored as already seen', async () => {
  const { service, conceded } = product()
  await conceded('one', ALICE, BOB, NOW)
  await service.syncAchievementDefinitions()
  expect(await service.newAchievements(ALICE)).toEqual([])
})

it('announces a medal earned after the quiet first check', async () => {
  const { service, operator, conceded } = product()
  await conceded('one', ALICE, BOB, NOW)
  await service.newAchievements(ALICE)
  await operator.registerPushToken({ userId: ALICE, token: 'device', platform: 'ios', now: NOW })
  expect((await service.newAchievements(ALICE)).map((achievement) => achievement.id)).toEqual(['field-kit'])
})
