import { setImmediate as yieldToEventLoop } from 'node:timers/promises'
import { getRequest } from '@tanstack/react-start/server'
import { createPostHogRpcLogger, createPostHogRpcObserver } from 'ras-stack/posthog/server'
import type { RpcLogger, RpcObserver } from 'ras-stack/server'
import { reportsToTelemetry, serverTelemetry } from '../adapters/posthog'
import { requireSameOrigin } from './origins'
import { currentUserId } from './playerSession'
import { currentServerFunction } from './serverFunction'

/** Where a failure happened: the request, the server function it ran, and the status of a thrown `Response`. */
export type RpcErrorContext = { method?: string; path?: string; function?: string; status?: number }

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

/** Runs a server function's work, turning a thrown `Response` into an error whose message reaches the client. */
export function rpc<T>(work: () => Promise<T> | T): Promise<T> {
  return run(work, currentRequest())
}

/** `rpc` for work that changes state: it answers 403 unless a browser on one of this application's origins sent the request. */
export function mutationRpc<T>(work: () => Promise<T> | T, request = currentRequest()): Promise<T> {
  return run(() => {
    if (!request) throw new Error('mutation request is unavailable')
    requireSameOrigin(request)
    return work()
  }, request)
}

function run<T>(work: () => Promise<T> | T, request: Request | undefined): Promise<T> {
  return observeRpc(request, async () => {
    try {
      return await work()
    } catch (thrown) {
      const status = thrown instanceof Response ? thrown.status : undefined
      const error =
        thrown instanceof Response ? new Error((await thrown.text()) || `request failed (${thrown.status})`, { cause: thrown }) : thrown
      // A 4xx answer is the caller's to fix; a 5xx one, such as an unreachable upstream, is the server's.
      if (status === undefined || status >= 500) await reportFailure(error, failureContext(request, status), request)
      throw error
    }
  })
}

async function reportFailure(error: unknown, context: RpcErrorContext, request: Request | undefined) {
  try {
    await reportRpcError(error, context, request)
  } catch {
    // The application's failure is the one the client sees.
  }
}

function failureContext(request: Request | undefined, status: number | undefined): RpcErrorContext {
  const name = currentServerFunction()?.name
  return {
    ...(request ? { method: request.method, path: new URL(request.url).pathname } : {}),
    ...(name ? { function: name } : {}),
    ...(status === undefined ? {} : { status }),
  }
}

function currentRequest() {
  try {
    return getRequest()
  } catch {
    return undefined
  }
}

/**
 * Work on each item in turn, as promises a server function returns so its answer streams each
 * result when it is ready. Other requests run between items, and a failure fails every item after
 * it, so work stops where it went wrong as it would in one loop.
 */
export function inTurn<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R>[] {
  const request = getRequest()
  const name = currentServerFunction()?.name
  const context = { method: request.method, path: new URL(request.url).pathname, ...(name ? { function: name } : {}) }
  let previous: Promise<unknown> = Promise.resolve()
  return items.map((item) => {
    const result = previous.then(async () => {
      await yieldToEventLoop()
      try {
        return await work(item)
      } catch (thrown) {
        // The answer has already left the wrapper that reports failures and reads refusals, so this does both.
        const status = thrown instanceof Response ? thrown.status : undefined
        const error =
          thrown instanceof Response ? new Error((await thrown.text()) || `request failed (${thrown.status})`, { cause: thrown }) : thrown
        if (status === undefined || status >= 500)
          await reportFailure(error, { ...context, ...(status === undefined ? {} : { status }) }, request)
        throw error
      }
    })
    previous = result
    return result
  })
}
