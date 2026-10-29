import { expect, it } from 'vitest'
import { reduceBattle, type Command } from '../core/battle'
import { ALICE, BOB, CAROL, builtRoster, log } from '../core/battle.fixtures'
import { byId } from '../core/collections'
import { battleFoldArgs } from '../core/offlineBattle'
import { standings } from '../core/standings'
import { battleSummary, type BattleFaction } from '../shared/battleSummary'
import { PraetoriumService } from './service'
import type { BattleHistory, RepositoryPort } from './spacetimeRepository'

const DAVE = 'dave'
const FACTIONS: BattleFaction[] = [{ id: 'cat', slug: 'death-guard', displayName: 'Death Guard', icon: null }]

/** A battle the loser conceded, its commands starting at `at`. */
function conceded(id: string, winner: string, loser: string, at: number, { reopened = false } = {}): BattleHistory {
  return {
    battle: { id, token: `${id}-token`, createdAt: at },
    players: [winner, loser].map((player, side) => ({ id: player, name: player, image: null, side, automated: false })),
    log: log(
      [winner, builtRoster('Winner army', ['Plague Marines'])],
      [loser, builtRoster('Loser army', ['Plague Marines'])],
      [winner, { kind: 'begin-battle', firstPlayerId: winner }],
      [winner, { kind: 'end-battle', reason: 'conceded', concededBy: loser }],
      ...(reopened ? [[winner, { kind: 'reopen-battle' }] as [string, Command]] : []),
    ).map((command) => ({ ...command, at: at + command.at })),
  }
}

/** The product database as the leaderboard reads it: battles, the revision each last changed at, and accounts. */
function product(initial: BattleHistory[]) {
  let revision = 0
  const held = new Map<string, BattleHistory>()
  const changed = new Map<string, number>()
  const names = new Map<string, string>()
  const write = (history: BattleHistory) => {
    held.set(history.battle.id, history)
    changed.set(history.battle.id, ++revision)
  }
  const remove = (id: string) => {
    held.delete(id)
    changed.set(id, ++revision)
  }
  initial.forEach(write)
  const repository = {
    battleChanges: async (after: number) => ({
      cursor: revision,
      battleIds: [...changed].flatMap(([id, at]) => (at > after ? [id] : [])),
    }),
    battlesByIds: async (ids: readonly string[]) => ids.flatMap((id) => held.get(id) ?? []),
    profilesByIds: async (ids: readonly string[]) => new Map(ids.map((id) => [id, { id, name: names.get(id) ?? id, image: null }])),
    practiceOpponents: async () => [],
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10_000,
    () => 0,
    undefined,
    async () => String(revision),
  )
  return { service, write, remove, names, held }
}

it('rates the same after changes as a full replay of every log', async () => {
  const { service, write, remove, names, held } = product([
    conceded('one', ALICE, BOB, 100),
    conceded('two', BOB, CAROL, 200),
    conceded('three', CAROL, ALICE, 300),
  ])
  await service.standings(FACTIONS)
  write(conceded('one', ALICE, BOB, 100, { reopened: true }))
  write(conceded('four', DAVE, ALICE, 400))
  remove('two')
  names.set(CAROL, 'Caz')
  const replay = standings(
    [...held.values()].map((history) =>
      battleSummary(
        { ...history, players: history.players.map((player) => ({ ...player, name: names.get(player.id) ?? player.name })) },
        reduceBattle(...battleFoldArgs(history.players, history.log)),
        null,
        null,
        byId(FACTIONS),
      ),
    ),
    { activeSince: 10_000 - 90 * 24 * 60 * 60 * 1000 },
  )
  const answer = await service.standings(FACTIONS)
  expect({ overall: answer.overall.rows, factions: answer.factions.map((table) => table.rows) }).toEqual({
    overall: replay.overall,
    factions: replay.factions.map((table) => table.rows),
  })
})

it('rates the oldest battle however many have finished since', async () => {
  const { service } = product([
    conceded('oldest', ALICE, BOB, 0),
    ...Array.from({ length: 10_000 }, (_, at) => conceded(`later-${at}`, CAROL, DAVE, 10 + at * 10)),
  ])
  expect((await service.playerRankings(ALICE)).overall?.standing.battles).toBe(1)
})
