import application from '../.output/server/index.mjs'
import { spacetimeSocket } from './spacetimeProxy'

type Environment = Parameters<typeof spacetimeSocket>[1] & {
  ASSETS: Fetcher
}

export default {
  fetch(request: Request, environment: Environment, context: ExecutionContext) {
    if (new URL(request.url).pathname.startsWith('/spacetime/')) return spacetimeSocket(request, environment)
    return application.fetch(request, environment, context)
  },
}
