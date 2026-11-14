import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { cachedPage, isSavedCopy } from './reads'

const capture = vi.hoisted(() => vi.fn())
const client = new QueryClient()
vi.mock('posthog-js', () => ({ posthog: { capture } }))
vi.mock('./localRuntime', () => ({ localClient: () => client, localOwner: () => ({ id: 'alice' }), localEngine: () => null }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  client.clear()
})

const saved = { battles: ['in progress'], nextCursor: null }
const fresh = { battles: ['finished'], nextCursor: null }

it('marks a saved battle list, counts it once, and refreshes it until the service answers', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  client.setQueryData(['battles'], { pages: [saved], pageParams: [null] })
  const refresh = vi.spyOn(client, 'invalidateQueries')
  const failed = () => Promise.reject(new TypeError('Failed to fetch'))

  await expect(cachedPage(['battles'], null, failed)).resolves.toBe(saved)
  await expect(cachedPage(['battles'], null, failed)).resolves.toBe(saved)
  expect(isSavedCopy(['battles'])).toBe(true)
  expect(capture).toHaveBeenCalledOnce()
  expect(capture).toHaveBeenCalledWith('saved_copy_shown', { query: 'battles', reason: 'network' })
  await vi.advanceTimersByTimeAsync(30_000)
  expect(refresh).toHaveBeenCalledWith({ queryKey: ['battles'], exact: true })

  await expect(cachedPage(['battles'], null, async () => fresh)).resolves.toBe(fresh)
  expect(isSavedCopy(['battles'])).toBe(false)
})
