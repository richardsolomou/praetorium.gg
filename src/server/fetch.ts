import pRetry from 'p-retry'
import { countServerMetric, requestOutcome, withServerSpan } from '../adapters/posthog'

const RETRYABLE_STATUS = new Set([408, 429])

export type FetchRetryOptions = {
  attempts?: number
  timeoutMs?: number
  minTimeoutMs?: number
}

class RetryableResponseError extends Error {
  constructor(readonly status: number) {
    super(`request answered ${status}`)
  }
}

/** A bounded request policy shared by every community-data download. */
export function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  { attempts = 3, timeoutMs = 15_000, minTimeoutMs = 250 }: FetchRetryOptions = {},
): Promise<Response> {
  const upstream = new URL(input).host
  return withServerSpan(`upstream.${upstream}`, () =>
    pRetry(
      async () => {
        const timeout = AbortSignal.timeout(timeoutMs)
        const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
        const response = await fetch(input, { ...init, signal }).catch((error: unknown) => {
          countServerMetric('external_request.requests', { upstream, ...requestOutcome() })
          throw error
        })
        countServerMetric('external_request.requests', { upstream, ...requestOutcome(response.status) })
        if (RETRYABLE_STATUS.has(response.status) || response.status >= 500) {
          await response.body?.cancel()
          throw new RetryableResponseError(response.status)
        }
        return response
      },
      {
        retries: Math.max(0, attempts - 1),
        minTimeout: minTimeoutMs,
        factor: 2,
        shouldRetry: ({ error }) => error instanceof RetryableResponseError || error instanceof TypeError || error.name === 'TimeoutError',
      },
    ),
  )
}
