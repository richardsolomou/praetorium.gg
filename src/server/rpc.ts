import { getRequest } from '@tanstack/react-start/server'
import { createRpc } from 'ras-stack/server'
import { requireMutationOrigin } from './mutationOrigin'

export const { rpc, mutationRpc } = createRpc({
  getRequest,
  requireMutation: requireMutationOrigin,
  logError: (error, context) => console.error({ event: 'server_function_failed', ...context, error }),
})
