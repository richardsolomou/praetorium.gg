import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { snapshotRevision } from './snapshotMemo'

/** Cache direct reference responses for an hour with a snapshot ETag; SSR documents follow `sharedPageCache` instead. */
export function cacheUntilSnapshotChanges() {
  if (process.env.NODE_ENV !== 'production') return
  const revision = snapshotRevision()
  if (!revision) return
  if (!new URL(getRequest().url).pathname.startsWith('/_serverFn/')) return
  setResponseHeader('Cache-Control', 'public, max-age=3600')
  setResponseHeader('ETag', `"${revision}"`)
}
