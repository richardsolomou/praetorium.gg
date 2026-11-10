import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareBattles } from './prepareBattles'

const mocks = vi.hoisted(() => ({ openBattle: vi.fn(), version: vi.fn() }))
vi.mock('../functions', () => ({ openBattle: mocks.openBattle }))
vi.mock('./localRuntime', () => ({ localVersion: mocks.version }))
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const battle = (token: string, serverSeq: number) => ({ token, serverSeq })
const opened = () => mocks.openBattle.mock.calls.map(([args]) => args.data.token)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.openBattle.mockResolvedValue({ kind: 'unavailable' })
})
afterEach(() => client.clear())

it('downloads a battle the device does not hold', async () => {
  mocks.version.mockResolvedValue(undefined)
  await prepareBattles(client, [battle('a', 4)], () => true)
  expect(opened()).toEqual(['a'])
})

it('downloads a battle the service has moved past', async () => {
  mocks.version.mockResolvedValue(3)
  await prepareBattles(client, [battle('a', 4)], () => true)
  expect(opened()).toEqual(['a'])
})

it('does not download a battle the device already holds at that version', async () => {
  mocks.version.mockResolvedValue(4)
  await prepareBattles(client, [battle('a', 4)], () => true)
  expect(opened()).toEqual([])
})

it('stops once the account changes', async () => {
  mocks.version.mockResolvedValue(undefined)
  await prepareBattles(client, [battle('a', 1), battle('b', 1)], () => false)
  expect(opened()).toEqual([])
})
