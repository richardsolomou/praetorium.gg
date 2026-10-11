import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../core/rosterLibrary'
import type { savedRosterSummaries } from '../functions'
import { prepareRosters } from './prepareRosters'

const mocks = vi.hoisted(() => ({ page: vi.fn(), access: vi.fn(), document: vi.fn() }))
vi.mock('../functions', () => ({ savedRosterPage: mocks.page, rosterAccess: mocks.access }))
vi.mock('./localRuntime', () => ({ localDocument: mocks.document }))
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
type Summaries = Awaited<ReturnType<typeof savedRosterSummaries>>
function summaries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    updatedAt: count - index,
    createdAt: 1,
    name: String(index),
  })) as Summaries
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.page.mockResolvedValue([])
  mocks.access.mockResolvedValue(null)
})
afterEach(() => client.clear())
it.each([0, 1, ROSTER_LIBRARY_BATCH_SIZE + 1])('prepares %i rosters in bounded library batches without full pricing', async (count) => {
  await prepareRosters(client, summaries(count), () => true)
  expect({
    batches: mocks.page.mock.calls.map(([args]) => args.data.ids.length),
    rosters: mocks.access.mock.calls.map(([args]) => args.data.id),
  }).toEqual({
    batches: count ? [Math.min(count, ROSTER_LIBRARY_BATCH_SIZE), ...(count > ROSTER_LIBRARY_BATCH_SIZE ? [1] : [])] : [],
    rosters: Array.from({ length: count }, (_, index) => String(index)),
  })
})
it('does not download an unchanged saved roster again', async () => {
  mocks.document.mockResolvedValue({ updatedAt: 1 })
  await prepareRosters(client, summaries(1), () => true)
  expect(mocks.access).not.toHaveBeenCalled()
})
it('downloads a newer server version', async () => {
  mocks.document.mockResolvedValue({ updatedAt: 0 })
  await prepareRosters(client, summaries(1), () => true)
  expect(mocks.access).toHaveBeenCalledOnce()
})
it('stops before downloading another account’s roster after a delayed storage read', async () => {
  let current = true
  mocks.document.mockImplementation(async () => {
    current = false
  })
  await prepareRosters(client, summaries(1), () => current)
  expect(mocks.access).not.toHaveBeenCalled()
})
it('keeps preparing roster documents after a points request fails', async () => {
  mocks.page.mockRejectedValue(new Error('Points unavailable'))
  await prepareRosters(client, summaries(1), () => true)
  expect(mocks.access).toHaveBeenCalledOnce()
})
