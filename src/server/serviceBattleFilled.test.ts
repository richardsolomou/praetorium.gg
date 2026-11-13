import { expect, it, vi } from 'vitest'
import type { Command } from '../core/battle'
import { ALICE, BOB, NAMES, log, roster } from '../core/battle.fixtures'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const configure = (places?: [number, number]): Command => ({
  kind: 'configure-battle',
  limit: null,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  clockLimitMinutes: null,
  ...(places ? { places } : {}),
})

/** Submits the last entry of `entries` against a battle holding all the others. */
async function filledBy(entries: [string, Command][]) {
  const after = log(...entries)
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: after.slice(0, -1),
  }
  const repository = {
    battleHistoryByToken: vi.fn().mockResolvedValue(history),
    battleByToken: vi.fn().mockResolvedValue(history),
    submit: vi.fn().mockResolvedValue({ result: { outcome: 'appended', seq: after.length }, log: after }),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  return (await service.submit('token', ALICE, history.log.length, after.at(-1)!.command)).filled
}

it('reports a draft filled by its last army', async () => {
  expect(
    await filledBy([
      [ALICE, configure([1, 1])],
      [ALICE, roster('Mine')],
      [BOB, roster('Theirs')],
    ]),
  ).toBe(true)
})

it('reports nothing while an army is still missing', async () => {
  expect(
    await filledBy([
      [ALICE, configure([1, 1])],
      [ALICE, roster('Mine')],
    ]),
  ).toBeUndefined()
})

it('reports nothing for a battle that named its players at creation', async () => {
  expect(
    await filledBy([
      [ALICE, configure()],
      [ALICE, roster('Mine')],
      [BOB, roster('Theirs')],
    ]),
  ).toBeUndefined()
})
