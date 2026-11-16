import { setImmediate as yieldToEventLoop } from 'node:timers/promises'
import { getRequest } from '@tanstack/react-start/server'
import { reportsToTelemetry } from '../adapters/posthog'
import { requireSameOrigin } from './origins'
import { currentUserId } from './playerSession'
import { observeServerFunction, reportServerFunctionFailure } from './rpcTelemetry'
import { currentServerFunction } from './serverFunction'
import { serverTelemetry } from './serverTelemetry'

/** Where a failure happened: the request, the server function it ran, and the status of a thrown `Response`. */
export type RpcErrorContext = { method?: string; path?: string; function?: string; status?: number }

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

async function run<T>(work: () => Promise<T> | T, request: Request | undefined): Promise<T> {
  const telemetry = serverTelemetry()
  // Only a reporting instance pays for the lookup, which attaches server work to the signed-in person.
  const user = reportsToTelemetry && request ? await currentUserId(request).catch(() => null) : null
  return observeServerFunction(
    telemetry,
    request,
    async () => {
      try {
        return await work()
      } catch (thrown) {
        const status = thrown instanceof Response ? thrown.status : undefined
        const error =
          thrown instanceof Response ? new Error((await thrown.text()) || `request failed (${thrown.status})`, { cause: thrown }) : thrown
        // A 4xx answer is the caller's to fix; a 5xx one, such as an unreachable upstream, is the server's.
        if (status === undefined || status >= 500) reportServerFunctionFailure(telemetry, error, failureContext(request, status))
        throw error
      }
    },
    user ?? undefined,
  )
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
          reportServerFunctionFailure(serverTelemetry(), error, { ...context, ...(status === undefined ? {} : { status }) })
        throw error
      }
    })
    previous = result
    return result
  })
}
