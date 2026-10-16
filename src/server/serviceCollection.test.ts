import { expect, it, vi } from 'vitest'
import { ALICE, BOB, NAMES, log } from '../core/battle.fixtures'
import type { Command } from '../core/battle'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const army = (entryIds: string[]): Command => ({
  kind: 'attach-roster',
  roster: {
    name: 'Army',
    text: entryIds.join('\n'),
    built: {
      catalogueId: 'cat',
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

function fielded(battles: ReturnType<typeof battle>[]) {
  const repository = { battlesSeatedBy: vi.fn().mockResolvedValue(battles) } as unknown as RepositoryPort
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

function sharedShelf() {
  const rows = [
    {
      userId: ALICE,
      entryId: 'ark',
      models: 1,
      at: 0,
      groups: [
        {
          models: 1,
          state: 'interchangeable' as const,
          builds: [
            { entryId: 'ark', equipment: '' },
            { entryId: 'ghost', equipment: '' },
          ],
        },
      ],
    },
  ]
  const repository = { collectionByUser: vi.fn().mockResolvedValue(rows) } as unknown as RepositoryPort
  return new PraetoriumService(
    repository,
    () => 0,
    () => 0,
  )
}

it('keeps the existing collection API limited to physical stock entries', async () => {
  expect(await sharedShelf().collection(ALICE)).toEqual(['ark'])
})

it('keeps the existing count API from counting alternative builds as extra stock', async () => {
  expect(await sharedShelf().collectionCounts(ALICE)).toEqual({ ark: 1 })
})

it('offers alternative datasheets to the owned filter without changing physical stock APIs', async () => {
  expect(await sharedShelf().availableCollection(ALICE)).toEqual(['ark', 'ghost'])
})
