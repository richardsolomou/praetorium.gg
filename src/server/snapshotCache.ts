import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { app } from './app'

/** Cache direct reference responses for an hour with a snapshot ETag; never add shared cache headers to SSR documents. */
export function cacheUntilSnapshotChanges() {
  const revision = app().catalogue()?.index.revision
  if (!revision) return
  if (!new URL(getRequest().url).pathname.startsWith('/_serverFn/')) return
  setResponseHeader('Cache-Control', 'public, max-age=3600')
  setResponseHeader('ETag', `"${revision}"`)
}
