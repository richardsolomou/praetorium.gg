import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { withTimeout } from '../abortSignals'
import { HttpStatusError } from '../networkErrors'
import { appReleaseNotes } from '../functions'
import { serviceStatusSchema } from '../../contracts/serviceStatus'

export const releaseQuery = () =>
  queryOptions({
    queryKey: ['release'],
    enabled: typeof window !== 'undefined',
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/release', { cache: 'no-store', signal: withTimeout(signal, 10_000) })
      if (!response.ok) throw new HttpStatusError('Release check failed', response.status)
      return z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) }).parse(await response.json())
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  })

/** Fixed for a build, so it is read once. */
export const releaseNotesQuery = () => queryOptions({ queryKey: ['release-notes'], queryFn: () => appReleaseNotes(), staleTime: Infinity })

/** Read in the browser only, so the page never shows a check the server made before it was sent. */
export const serviceStatusQuery = () =>
  queryOptions({
    queryKey: ['service-status'],
    enabled: typeof window !== 'undefined',
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/status', { cache: 'no-store', signal: withTimeout(signal, 15_000) })
      if (!response.ok) throw new HttpStatusError('Status check failed', response.status)
      return serviceStatusSchema.parse(await response.json())
    },
    refetchInterval: 60_000,
    retry: false,
  })
