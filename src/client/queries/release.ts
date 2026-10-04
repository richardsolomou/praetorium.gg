import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'

export const releaseQuery = () =>
  queryOptions({
    queryKey: ['release'],
    enabled: typeof window !== 'undefined',
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/release', { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) })
      if (!response.ok) throw new Error('Release check failed')
      return z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) }).parse(await response.json())
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  })
