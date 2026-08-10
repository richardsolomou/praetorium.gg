import { createTanStackRpc } from 'ras-stack/tanstack/server'
import { createPostHogRpcLogger } from 'ras-stack/posthog/server'
import type { RpcLogger } from 'ras-stack/server'
import { app } from './app'
import { requireMutationOrigin } from './mutationOrigin'

const reportRpcError: RpcLogger = (error, context, request) =>
  createPostHogRpcLogger(app().telemetry, {
    logError: (reportedError, reportedContext) =>
      console.error({ event: 'server_function_failed', ...reportedContext, error: reportedError }),
    resolveAuthenticatedDistinctId: async (reportedRequest) =>
      (await app().auth.api.getSession({ headers: reportedRequest.headers }))?.user.id,
    allowAnonymousDistinctId: true,
  })(error, context, request)

export const { rpc, mutationRpc } = createTanStackRpc({
  requireMutation: requireMutationOrigin,
  logError: reportRpcError,
})
