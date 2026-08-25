import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { app } from './app'

/**
 * Marks a reference read as reusable by the browser until the snapshot changes.
 *
 * These responses derive only from the immutable catalogue snapshot, which the
 * instance already refreshes at most hourly, so an hour of browser reuse adds
 * nothing to the staleness the product accepts. The revision doubles as a
 * validator for caches that revalidate.
 *
 * Only on a direct server-function request: during SSR the same handlers run
 * inside the document render, and a shared max-age there would let the browser
 * reuse a personalized HTML page wholesale.
 */
export function cacheUntilSnapshotChanges() {
  const revision = app().catalogue()?.index.revision
  if (!revision) return
  if (!new URL(getRequest().url).pathname.startsWith('/_serverFn/')) return
  setResponseHeader('Cache-Control', 'public, max-age=3600')
  setResponseHeader('ETag', `"${revision}"`)
}
