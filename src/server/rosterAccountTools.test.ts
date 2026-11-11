import { beforeEach, expect, it, vi } from 'vitest'

const { ownRoster, deleteRoster, copySavedRoster, capture, counts, countsAs } = vi.hoisted(() => ({
  ownRoster: vi.fn(),
  deleteRoster: vi.fn(),
  copySavedRoster: vi.fn(),
  capture: vi.fn(),
  counts: { value: {} },
  countsAs: { value: {} },
}))
vi.mock('./saveOwnedRoster', () => ({ copySavedRoster, saveOwnedRoster: vi.fn() }))
vi.mock('./publishedTextFiles', () => ({
  publishedTextLocations: async () => ({ files: {}, holds: () => false, recordsHolding: () => [] }),
}))
vi.mock('./app', () => ({
  app: () => ({
    service: {
      sealedEventService: { ownRoster },
      rosterService: {
        deleteRoster,
        collectionCounts: async () => counts.value,
        collectionProgress: async () => ({ warriors: { built: 20, painted: 10 } }),
        collectionCountsAs: async () => countsAs.value,
      },
    },
    telemetry: { capture },
    combatUnitsFor: async () => [
      {
        catalogueId: 'necrons',
        name: 'Necrons',
        units: [
          { id: 'warriors', slug: 'necron-warriors', name: 'Necron Warriors' },
          { id: 'immortals', slug: 'immortals', name: 'Immortals' },
        ],
      },
      { catalogueId: 'orks', name: 'Orks', units: [{ id: 'boyz', slug: 'boyz', name: 'Boyz' }] },
    ],
  }),
}))

import { AgentTools } from './agentTools'
import { registerRosterAccountTools } from './rosterAccountTools'

beforeEach(() => {
  vi.clearAllMocks()
  counts.value = {}
  countsAs.value = {}
})

async function call(name: string, args: object) {
  const tools = new AgentTools()
  registerRosterAccountTools(tools, 'player-1')
  return tools.execute(name, args)
}

it('does not delete a roster the player does not own', async () => {
  ownRoster.mockResolvedValueOnce(null)
  const result = await call('delete_roster', { id: 'someone-elses' })
  expect([result.isError, deleteRoster.mock.calls.length]).toEqual([true, 0])
})

it('deletes an owned roster and reports it as an agent’s deletion', async () => {
  ownRoster.mockResolvedValueOnce({ id: 'roster-1', name: 'My army' })
  await call('delete_roster', { id: 'roster-1' })
  expect(capture).toHaveBeenLastCalledWith('player-1', 'roster_deleted', { delivery: 'direct', via: 'agent' })
})

it('refuses to copy a roster the player cannot open', async () => {
  copySavedRoster.mockResolvedValueOnce(null)
  expect((await call('copy_roster', { id: 'private-roster' })).isError).toBe(true)
})

it('names each owned datasheet by the id list_units gives, with what it counts as', async () => {
  counts.value = { warriors: 20 }
  countsAs.value = { warriors: ['immortals'] }
  const result = await call('get_my_collection', { faction: 'necrons' })
  expect(result.structuredContent?.factions).toEqual([
    {
      catalogueId: 'necrons',
      name: 'Necrons',
      models: 20,
      datasheets: 1,
      entries: [
        {
          id: 'warriors',
          slug: 'necron-warriors',
          name: 'Necron Warriors',
          models: 20,
          built: 20,
          painted: 10,
          countsAs: [{ id: 'immortals', name: 'Immortals' }],
        },
      ],
    },
  ])
})

it('answers a very large collection with faction totals until a faction is chosen', async () => {
  counts.value = Object.fromEntries(Array.from({ length: 201 }, (_, at) => [`retired-${at}`, 1]))
  const result = await call('get_my_collection', {})
  expect(result.structuredContent?.factions).toEqual([{ catalogueId: null, name: 'Earlier rules', models: 201, datasheets: 201 }])
})
