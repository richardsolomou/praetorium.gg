import { createTanStackRpc } from 'ras-stack/tanstack/server'
import { requireMutationOrigin } from './mutationOrigin'

export const { rpc, mutationRpc } = createTanStackRpc({
  requireMutation: requireMutationOrigin,
  logError: (error, context) => console.error({ event: 'server_function_failed', ...context, error }),
})
