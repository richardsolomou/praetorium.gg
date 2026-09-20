import { getRequest } from '@tanstack/react-start/server'
import { createTanStackRpc } from 'ras-stack/tanstack/server'
import { createPostHogRpcLogger } from 'ras-stack/posthog/server'
import type { RpcLogger } from 'ras-stack/server'
import { serverTelemetry } from '../adapters/posthog'
import { app } from './app'
import { requireMutationOrigin } from './mutationOrigin'
import { observeServerFunction } from './rpcTelemetry'

/** Only a deployed instance reports to the shared telemetry project. */
const reportsToTelemetry = process.env.NODE_ENV === 'production'

const postHogRpcLogger = createPostHogRpcLogger(serverTelemetry(), {
  logError: (error, context) => console.error({ event: 'server_function_failed', ...context, error }),
  resolveAuthenticatedDistinctId: async (request) => (await app().auth.api.getSession({ headers: request.headers }))?.user.id,
  allowAnonymousDistinctId: true,
})

const reportRpcError: RpcLogger = (error, context, request) => {
  if (!reportsToTelemetry) {
    console.error({ event: 'server_function_failed', ...context, error })
    return
  }
  return postHogRpcLogger(error, context, request)
}

const tanStackRpc = createTanStackRpc({
  requireMutation: requireMutationOrigin,
  logError: reportRpcError,
})

export function rpc<T>(work: () => T | Promise<T>) {
  const request = currentRequest()
  return request ? observeServerFunction(serverTelemetry(), request, () => tanStackRpc.rpc(work)) : tanStackRpc.rpc(work)
}

export function mutationRpc<T>(work: () => T | Promise<T>, request = currentRequest()) {
  return request
    ? observeServerFunction(serverTelemetry(), request, () => tanStackRpc.mutationRpc(work, request))
    : tanStackRpc.mutationRpc(work, request)
}

function currentRequest() {
  try {
    return getRequest()
  } catch {
    return undefined
  }
}
