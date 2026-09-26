import application from '../.output/server/index.mjs'
import type { R2Bucket } from '@cloudflare/workers-types'
import resvg from '@resvg/resvg-wasm/index_bg.wasm'
import yoga from 'satori/yoga.wasm'
import { withWorkerAppContext } from '../src/server/workerAppContext'
import { publicObject } from './publicObjects'
import { spacetimeSocket } from './spacetimeProxy'

type Environment = Parameters<typeof spacetimeSocket>[1] & {
  ASSETS: Fetcher
  PUBLIC_OBJECTS?: R2Bucket
}

export default {
  fetch(request: Request, environment: Environment, context: ExecutionContext) {
    const pathname = new URL(request.url).pathname
    if (new URL(request.url).hostname === 's3.praetorium.gg' || pathname.startsWith('/praetorium/')) {
      return environment.PUBLIC_OBJECTS ? publicObject(request, environment.PUBLIC_OBJECTS) : new Response(null, { status: 404 })
    }
    if (pathname.startsWith('/_catalogue/')) return new Response(null, { status: 404 })
    if (pathname.startsWith('/spacetime/')) return spacetimeSocket(request, environment)
    const response = withWorkerAppContext(
      () => application.fetch(request, environment, context),
      context,
      { resvg, yoga },
      environment.PUBLIC_OBJECTS,
    )
    if (pathname !== '/api/health') return response
    return Promise.resolve(response).then((result) => {
      const marked = new Response(result.body, result)
      marked.headers.set('x-praetorium-runtime', 'cloudflare')
      return marked
    })
  },
}
