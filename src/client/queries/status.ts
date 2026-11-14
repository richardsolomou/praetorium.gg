import { queryOptions } from '@tanstack/react-query'
import { serviceStatusSchema } from '../../contracts/serviceStatus'
import { withTimeout } from '../abortSignals'
import { HttpStatusError } from '../networkErrors'

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
