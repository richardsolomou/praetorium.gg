import { expect, it, vi } from 'vitest'
import { publishRetryingStalls } from './publishProductModule'

it('publishes again after a stalled request', async () => {
  const publish = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new DOMException('aborted', 'TimeoutError')).mockResolvedValue()
  await publishRetryingStalls(publish, 1)
  expect(publish).toHaveBeenCalledTimes(2)
})

it('does not repeat a migration the server refused', async () => {
  const publish = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('SpacetimeDB database needs a manual migration'))
  await expect(publishRetryingStalls(publish, 1)).rejects.toThrow('manual migration')
  expect(publish).toHaveBeenCalledTimes(1)
})
