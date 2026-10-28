import type { QueryClient } from '@tanstack/react-query'
import {
  APP_SNAPSHOT_QUERIES,
  MAX_APP_SNAPSHOT_BYTES,
  MAX_APP_SNAPSHOT_QUERIES,
  PUBLIC_APP_QUERIES,
  PUBLIC_REFERENCE_QUERIES,
  type AppSnapshot,
} from '../../contracts/appSnapshot'
import { meKey } from '../queries/queryKeys'
import { jsonByteLength } from '../../core/json'

declare global {
  interface Window {
    PraetoriumAppSnapshot?: AppSnapshot
  }
}

// Query data is replaced rather than mutated, so a response measured once keeps its size until the query changes.
const dataBytes = new WeakMap<object, number>()
function measuredBytes(data: unknown) {
  if (typeof data !== 'object' || data === null) return jsonByteLength(data)
  let bytes = dataBytes.get(data)
  if (bytes === undefined) dataBytes.set(data, (bytes = jsonByteLength(data)))
  return bytes
}

export function captureAppSnapshot(client: QueryClient): AppSnapshot | null {
  const me = client.getQueryData(meKey()) as { id: string; impersonatedBy?: string | null } | null | undefined
  if (me === undefined || me?.impersonatedBy) return null
  const owner = me?.id ?? null
  const queries: AppSnapshot['queries'] = []
  let bytes = 0
  const candidates = client
    .getQueryCache()
    .getAll()
    .filter(
      (query) =>
        query.state.data !== undefined &&
        query.state.dataUpdatedAt > 0 &&
        APP_SNAPSHOT_QUERIES.has(String(query.queryKey[0])) &&
        (owner || query.queryKey[0] === 'me' || PUBLIC_APP_QUERIES.has(String(query.queryKey[0]))),
    )
    .sort((a, b) => Number(b.queryKey[0] === 'me') - Number(a.queryKey[0] === 'me') || b.state.dataUpdatedAt - a.state.dataUpdatedAt)
  for (const query of candidates) {
    const entry = { key: [...query.queryKey], data: query.state.data, updatedAt: query.state.dataUpdatedAt }
    const size = jsonByteLength({ ...entry, data: null }) - 'null'.length + measuredBytes(entry.data)
    // The kilobyte held back covers the snapshot's own fields and separators, so the whole snapshot stays within the limit.
    if (bytes + size > MAX_APP_SNAPSHOT_BYTES - 1024 || queries.length === MAX_APP_SNAPSHOT_QUERIES) continue
    bytes += size
    queries.push(entry)
  }
  return { version: 1, owner, queries }
}

export function restoreAppSnapshot(client: QueryClient, snapshot: AppSnapshot) {
  const current = client.getQueryData(meKey()) as { id?: string; impersonatedBy?: string | null } | null | undefined
  if (current !== undefined && (current?.id !== (snapshot.owner ?? undefined) || current?.impersonatedBy)) return
  for (const query of snapshot.queries) {
    if ((client.getQueryState(query.key)?.dataUpdatedAt ?? 0) < query.updatedAt)
      client.setQueryData(query.key, query.data, { updatedAt: query.updatedAt })
  }
}

export function reconcileAppAccount(client: QueryClient, me: { id: string; impersonatedBy?: string | null } | null) {
  const previous = client.getQueryData(meKey()) as { id?: string; impersonatedBy?: string | null } | null | undefined
  if (previous === undefined || (previous?.id === me?.id && previous?.impersonatedBy === me?.impersonatedBy)) return false
  const privateQuery = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] !== 'me' &&
    !PUBLIC_APP_QUERIES.has(String(query.queryKey[0])) &&
    !PUBLIC_REFERENCE_QUERIES.has(String(query.queryKey[0]))
  void client.cancelQueries({ predicate: privateQuery })
  client.removeQueries({ predicate: privateQuery })
  return true
}
