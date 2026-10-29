import { setImmediate as yieldToEventLoop } from 'node:timers/promises'
import { getRequest } from '@tanstack/react-start/server'
import { createTanStackRpc } from 'ras-stack/tanstack/server'
import { createPostHogRpcLogger, createPostHogRpcObserver } from 'ras-stack/posthog/server'
import type { RpcLogger, RpcObserver } from 'ras-stack/server'
import { reportsToTelemetry, serverTelemetry } from '../adapters/posthog'
import { currentUserId } from './playerSession'
import { requireMutationOrigin } from './mutationOrigin'

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

/**
 * The RPC wrapper turns a thrown `Response` into an error without reporting it, so an answer
 * that is the server's fault, such as an unreachable upstream, is logged here by its status.
 */
export const reportServerErrorResponses: RpcObserver = async (request, work) => {
  try {
    return await work()
  } catch (error) {
    const status = error instanceof Error && error.cause instanceof Response ? error.cause.status : undefined
    if (status !== undefined && status >= 500)
      await serverTelemetry()
        .log({
          body: 'server function answered with a server error',
          severityText: 'error',
          attributes: { status, ...(request ? { request_path: new URL(request.url).pathname } : {}) },
        })
        .catch(() => {})
    throw error
  }
}

const postHogRpcObserver = createPostHogRpcObserver(serverTelemetry())
const observeRpc: RpcObserver = (request, work) =>
  reportsToTelemetry ? postHogRpcObserver(request, () => reportServerErrorResponses(request, work)) : work()

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
