import { beforeEach, expect, it, vi } from 'vitest'
import { app } from './app'
import { memoUntilSnapshotChanges } from './snapshotMemo'

vi.mock('./app', () => ({ app: vi.fn() }))

const revision = (value: string) => vi.mocked(app).mockReturnValue({ catalogue: () => ({ index: { revision: value } }) } as never)

beforeEach(() => {
  delete process.env.CATALOGUE_SNAPSHOT_ID
  revision(crypto.randomUUID())
})

it('computes one answer per input for every reader of a snapshot', async () => {
  const compute = vi.fn(async () => ({ name: 'Intercessors' }))
  await memoUntilSnapshotChanges('datasheet', { slug: 'intercessors' }, compute)
  await memoUntilSnapshotChanges('datasheet', { slug: 'intercessors' }, compute)
  expect(compute).toHaveBeenCalledTimes(1)
})

it('computes again after the snapshot changes', async () => {
  const compute = vi.fn(async () => 'answer')
  await memoUntilSnapshotChanges('datasheet', { slug: 'a' }, compute)
  revision('next')
  await memoUntilSnapshotChanges('datasheet', { slug: 'a' }, compute)
  expect(compute).toHaveBeenCalledTimes(2)
})

it('computes separately for different inputs', async () => {
  const compute = vi.fn(async () => 'answer')
  await memoUntilSnapshotChanges('datasheet', { slug: 'a' }, compute)
  await memoUntilSnapshotChanges('datasheet', { slug: 'b' }, compute)
  expect(compute).toHaveBeenCalledTimes(2)
})

it('does not keep a failed answer', async () => {
  const compute = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce('answer')
  await expect(memoUntilSnapshotChanges('datasheet', { slug: 'a' }, compute)).rejects.toThrow('unavailable')
  await expect(memoUntilSnapshotChanges('datasheet', { slug: 'a' }, compute)).resolves.toBe('answer')
})
