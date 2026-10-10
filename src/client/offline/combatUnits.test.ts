import { afterEach, expect, it, vi } from 'vitest'
import { combatUnits } from '../functions'

const mocks = vi.hoisted(() => ({ reference: vi.fn(), server: vi.fn(), construction: vi.fn() }))
vi.mock('./runtime', () => ({ referenceData: mocks.reference }))
vi.mock('./construction', () => ({ localConstruction: mocks.construction }))
vi.mock('../../server/functions', () => ({ combatUnits: mocks.server }))
afterEach(() => vi.clearAllMocks())

it('opens the downloaded combat picker without rebuilding every army', async () => {
  const shelves = [{ catalogueId: 'codex~army', name: 'Army', units: [{ id: 'unit', name: 'Unit', points: 120 }] }]
  mocks.reference.mockReturnValue({ queries: [{ key: ['combat-units'], data: shelves }] })
  expect({ shelves: await combatUnits(), rebuilds: mocks.construction.mock.calls, requests: mocks.server.mock.calls }).toEqual({
    shelves,
    rebuilds: [],
    requests: [],
  })
})

it('uses the refreshed downloaded combat picker', async () => {
  mocks.reference.mockReturnValueOnce({ queries: [{ key: ['combat-units'], data: [{ name: 'Previous' }] }] })
  await combatUnits()
  mocks.reference.mockReturnValueOnce({ queries: [{ key: ['combat-units'], data: [{ name: 'Current' }] }] })
  expect(await combatUnits()).toEqual([{ name: 'Current' }])
})

it('loads the connected combat picker before a reference has downloaded', async () => {
  mocks.reference.mockReturnValue(undefined)
  mocks.server.mockResolvedValue([{ name: 'Connected' }])
  expect(await combatUnits()).toEqual([{ name: 'Connected' }])
})
