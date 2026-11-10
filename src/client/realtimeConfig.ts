import { useQuery } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import { z } from 'zod'
import { withTimeout } from './abortSignals'
import { realtimeModeKey } from './queries/queryKeys'
import { isExpectedRealtimeFailure, RealtimeHttpError } from './realtimeErrors'

/** The SpacetimeDB proxy on the page's own origin, which a local server may have named by another host. */
export const browserUri = (uri: string) => new URL(new URL(uri).pathname, window.location.origin).toString()

export function useRealtimeConfig() {
  const { data, error } = useQuery({
    queryKey: realtimeModeKey(),
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/realtime/mode', { signal: withTimeout(signal, 10_000) })
      if (!response.ok) throw new RealtimeHttpError('Realtime mode', response.status)
      const parsed = z.object({ mode: z.literal('spacetime'), database: z.string().min(1), uri: z.url() }).parse(await response.json())
      return { ...parsed, uri: browserUri(parsed.uri) }
    },
    staleTime: Infinity,
  })
  useEffect(() => {
    if (error) reportRealtime(error)
  }, [error])
  return data ?? null
}

export type RealtimeConfig = NonNullable<ReturnType<typeof useRealtimeConfig>>

export function reportRealtime(error: unknown, expected: (error: unknown) => boolean = isExpectedRealtimeFailure) {
  if (expected(error)) return
  posthog.captureException(error, { operation: 'spacetime_realtime' })
  console.error({ event: 'spacetime_realtime_failed', error })
}
