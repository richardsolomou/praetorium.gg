import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { signedInDestination } from './signInGuard'

describe('signedInDestination', () => {
  it('refetches a stale signed-in account before redirecting', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['me'], { id: 'stale-player' })
    const fetchAccount = vi.fn().mockResolvedValue(null)

    await expect(signedInDestination(queryClient, '/rosters', fetchAccount)).resolves.toBeUndefined()
    expect(fetchAccount).toHaveBeenCalledOnce()
  })

  it('refetches a stale signed-out result before showing the form', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['me'], null)
    const fetchAccount = vi.fn().mockResolvedValue({ id: 'current-player' })

    await expect(signedInDestination(queryClient, '/rosters', fetchAccount)).resolves.toBe('/rosters')
    expect(fetchAccount).toHaveBeenCalledOnce()
  })
})
