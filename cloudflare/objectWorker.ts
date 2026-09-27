import type { R2Bucket } from '@cloudflare/workers-types'
import { publicObject } from './publicObjects'

export default {
  fetch(request: Request, environment: { PUBLIC_OBJECTS: R2Bucket }) {
    return publicObject(request, environment.PUBLIC_OBJECTS)
  },
}
