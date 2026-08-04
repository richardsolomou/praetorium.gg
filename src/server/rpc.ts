import { getRequest } from '@tanstack/react-start/server'
import { requireMutationOrigin } from './mutationOrigin'

/**
 * Server functions must funnel through this: a thrown `Response` otherwise
 * reaches the client as a successful result instead of an error.
 */
export async function rpc<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Response) throw new Error((await error.text()) || `request failed (${error.status})`, { cause: error })
    console.error({ event: 'server_function_failed', ...requestContext(), error })
    throw error
  }
}

export function mutationRpc<T>(work: () => Promise<T> | T, request?: Request) {
  return rpc(() => {
    requireMutationOrigin(request)
    return work()
  })
}

function requestContext() {
  try {
    const request = getRequest()
    return { method: request.method, path: new URL(request.url).pathname }
  } catch {
    return {}
  }
}
