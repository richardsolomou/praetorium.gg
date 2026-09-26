import application from '../.output/server/index.mjs'
import { withWorkerAppContext } from '../src/server/workerAppContext'
import { spacetimeSocket } from './spacetimeProxy'

type Environment = Parameters<typeof spacetimeSocket>[1] & {
  ASSETS: Fetcher
}

export default {
  fetch(request: Request, environment: Environment, context: ExecutionContext) {
    const pathname = new URL(request.url).pathname
    if (pathname.startsWith('/_catalogue/')) return new Response(null, { status: 404 })
    if (pathname.startsWith('/spacetime/')) return spacetimeSocket(request, environment)
    return withWorkerAppContext(() => application.fetch(request, environment, context), context)
  },
}
