import { expect, it, vi } from 'vitest'
import { ALICE, BOB, NAMES, log } from '../core/battle.fixtures'
import type { Command } from '../core/battle'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const army = (entryIds: string[], catalogueId = 'cat'): Command => ({
  kind: 'attach-roster',
  roster: {
    name: 'Army',
    text: entryIds.join('\n'),
    built: {
      catalogueId,
      revision: 'rev',
      limit: 2000,
      detachment: 'Detachment',
      disposition: 'reconnaissance',
      units: entryIds.map((entryId, index) => ({ key: `${index}-${entryId}`, name: entryId, points: 100, models: 1, entryId })),
    },
  },
})

const battle = (id: string, ...entries: Parameters<typeof log>) => ({
  battle: { id, token: id, createdAt: 0 },
  players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
  log: log(...entries),
})

function fielded(battles: ReturnType<typeof battle>[], rosters: { catalogueId: string; archived: boolean }[] = []) {
  const repository = {
    battlesSeatedBy: vi.fn().mockResolvedValue(battles),
    rostersByUser: vi.fn().mockResolvedValue(rosters),
  } as unknown as RepositoryPort
  return new PraetoriumService(
    repository,
    () => 0,
    () => 0,
  ).fieldedDatasheets(ALICE)
}

it('suggests nothing before the player has fielded an army', async () => {
  expect(await fielded([])).toEqual([])
})

it('counts each datasheet once per battle in the player’s own army', async () => {
  expect(await fielded([battle('one', [ALICE, army(['overlord', 'warriors', 'warriors'])])])).toEqual([
    { entryId: 'overlord', battles: 1 },
    { entryId: 'warriors', battles: 1 },
  ])
})

it('orders datasheets by how many battles used them and ignores the opponent’s army', async () => {
  expect(
    await fielded([
      battle('one', [ALICE, army(['warriors', 'overlord'])], [BOB, army(['boyz'])]),
      battle('two', [ALICE, army(['overlord'])]),
    ]),
  ).toEqual([
    { entryId: 'overlord', battles: 2 },
    { entryId: 'warriors', battles: 1 },
  ])
})

it('leaves out armies the player has archived every roster for', async () => {
  expect(
    await fielded(
      [battle('one', [ALICE, army(['overlord'], 'necrons')]), battle('two', [ALICE, army(['boyz'], 'orks')])],
      [
        { catalogueId: 'necrons', archived: true },
        { catalogueId: 'orks', archived: false },
      ],
    ),
  ).toEqual([{ entryId: 'boyz', battles: 1 }])
})
