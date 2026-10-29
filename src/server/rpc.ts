import { setImmediate as yieldToEventLoop } from 'node:timers/promises'
import { getRequest } from '@tanstack/react-start/server'
import { createTanStackRpc } from 'ras-stack/tanstack/server'
import { createPostHogRpcLogger, createPostHogRpcObserver } from 'ras-stack/posthog/server'
import type { RpcLogger, RpcObserver } from 'ras-stack/server'
import { serverTelemetry } from '../adapters/posthog'
import { currentUserId } from './playerSession'
import { requireMutationOrigin } from './mutationOrigin'

/** Only a deployed instance reports to the shared telemetry project. */
const reportsToTelemetry = process.env.NODE_ENV === 'production'

const logError: RpcLogger = (error, context) => console.error({ event: 'server_function_failed', ...context, error })

const postHogRpcLogger = createPostHogRpcLogger(serverTelemetry(), {
  logError,
  resolveAuthenticatedDistinctId: async (request) => (await currentUserId(request)) ?? undefined,
  allowAnonymousDistinctId: true,
})

const reportRpcError: RpcLogger = (error, context, request) => {
  if (!reportsToTelemetry) return logError(error, context, request)
  return postHogRpcLogger(error, context, request)
}

const postHogRpcObserver = createPostHogRpcObserver(serverTelemetry())
const observeRpc: RpcObserver = (request, work) => (reportsToTelemetry ? postHogRpcObserver(request, work) : work())

export const { rpc, mutationRpc } = createTanStackRpc({
  requireMutation: requireMutationOrigin,
  logError: reportRpcError,
  observe: observeRpc,
})

/**
 * Work on each item in turn, as promises a server function returns so its answer streams each
 * result when it is ready. Other requests run between items, and a failure fails every item after
 * it, so work stops where it went wrong as it would in one loop.
 */
export function inTurn<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R>[] {
  const request = getRequest()
  const context = { method: request.method, path: new URL(request.url).pathname }
  let previous: Promise<unknown> = Promise.resolve()
  return items.map((item) => {
    const result = previous.then(async () => {
      await yieldToEventLoop()
      try {
        return await work(item)
      } catch (error) {
        // The answer has already left the wrapper that reports failures and reads refusals, so this does both.
        if (error instanceof Response) throw new Error((await error.text()) || `request failed (${error.status})`, { cause: error })
        await Promise.resolve(reportRpcError(error, context, request)).catch(() => {})
        throw error
      }
    })
    previous = result
    return result
  })
}
