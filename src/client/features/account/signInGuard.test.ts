import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as server from '../../../server/functions'
import { signedInDestination } from './signInGuard'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('signedInDestination', () => {
  it('refetches a stale signed-in account before redirecting', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['me'], { id: 'stale-player' })
    const fetchAccount = vi.spyOn(server, 'me').mockResolvedValue(null)

    await expect(signedInDestination(queryClient, '/rosters')).resolves.toBeUndefined()
    expect(fetchAccount).toHaveBeenCalledOnce()
  })

  it('refetches a stale signed-out result before showing the form', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['me'], null)
    const fetchAccount = vi.spyOn(server, 'me').mockResolvedValue({ id: 'current-player' } as Awaited<ReturnType<typeof server.me>>)

    await expect(signedInDestination(queryClient, '/rosters')).resolves.toBe('/rosters')
    expect(fetchAccount).toHaveBeenCalledOnce()
  })
})
