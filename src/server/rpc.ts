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
