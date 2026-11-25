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
import { queryResource, type LocalState } from '../../contracts/localState'
import { localEngine, stopLocalRuntime } from './localRuntime'
import { jsonByteLength } from '../../core/json'

/** A filtered battle list is a passing question; offline, filters answer from the saved whole feeds instead. */
const isFilteredFeed = (key: readonly unknown[]) =>
  key.length > 1 && ['battles', 'public-battles', 'friend-battles'].includes(String(key[0]))

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
  const me = client.getQueryData<{ id: string; impersonatedBy?: string | null } | null>(meKey())
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
        !isFilteredFeed(query.queryKey) &&
        (owner || query.queryKey[0] === 'me' || PUBLIC_APP_QUERIES.has(String(query.queryKey[0]))),
    )
    .sort((a, b) => Number(b.queryKey[0] === 'me') - Number(a.queryKey[0] === 'me') || b.state.dataUpdatedAt - a.state.dataUpdatedAt)
  for (const query of candidates) {
    const entry = {
      key: [...query.queryKey],
      data: query.state.data,
      updatedAt: query.state.dataUpdatedAt,
    }
    const size = jsonByteLength({ ...entry, data: null }) - 'null'.length + measuredBytes(entry.data)
    // The kilobyte held back covers the snapshot's own fields and separators, so the whole snapshot stays within the limit.
    if (bytes + size > MAX_APP_SNAPSHOT_BYTES - 1024 || queries.length === MAX_APP_SNAPSHOT_QUERIES) continue
    bytes += size
    queries.push(entry)
  }
  return { version: 1, owner, queries }
}

type DeviceDocuments = LocalState['documents']

/** The documents this device saved for the signed-in account; every edit reaches them before any screen shows it. */
export async function deviceDocuments(): Promise<DeviceDocuments | undefined> {
  try {
    return (await localEngine()?.storage.read())?.documents
  } catch {
    return undefined
  }
}

/** The roster a read answers with, whether alone or inside its access and price. */
function carriedRoster(data: unknown) {
  const roster = (data as { roster?: unknown } | null)?.roster ?? data
  const { id, updatedAt } = (roster ?? {}) as { id?: unknown; updatedAt?: unknown }
  return typeof id === 'string' && typeof updatedAt === 'number' ? { id, updatedAt } : undefined
}

/**
 * The device's documents outrank saved screens: a screen saved before the page closed, or by another tab still
 * holding an older copy, can trail an edit the device already holds, and an editor opened on it saves over that edit.
 */
function deviceAnswer(key: readonly unknown[], data: unknown, documents: DeviceDocuments) {
  const roster = carriedRoster(data)
  const saved = roster && documents[`roster:${roster.id}`]
  if (saved && ((saved.data as { updatedAt?: number } | null)?.updatedAt ?? Infinity) > roster.updatedAt) return { outdated: true }
  const query = documents[queryResource(key)]
  return query ? { data: query.data } : { data }
}

/**
 * Fills queries this page has not answered yet. Given the device's documents, it also takes back what an earlier
 * restore filled from the same snapshot, so a page restored before storage could be read is corrected before it shows.
 */
export function restoreAppSnapshot(client: QueryClient, snapshot: AppSnapshot, documents?: DeviceDocuments) {
  const current = client.getQueryData<{ id?: string; impersonatedBy?: string | null } | null>(meKey())
  if (current !== undefined && (current?.id !== (snapshot.owner ?? undefined) || current?.impersonatedBy)) return
  for (const query of snapshot.queries) {
    const state = client.getQueryState(query.key)
    const restored = state?.data !== undefined && state.data === query.data
    if (!restored && (state?.dataUpdatedAt ?? 0) >= query.updatedAt) continue
    const answer = documents ? deviceAnswer(query.key, query.data, documents) : { data: query.data }
    if ('outdated' in answer) {
      if (restored) client.removeQueries({ queryKey: query.key, exact: true })
      continue
    }
    if (restored && answer.data === query.data) continue
    client.setQueryData(query.key, answer.data, { updatedAt: query.updatedAt })
    // The last write before the page closed can outrun the snapshot it would have marked, so even a recent answer is fetched again once shown.
    void client.invalidateQueries({ queryKey: query.key, exact: true }, { cancelRefetch: false })
  }
}

export function reconcileAppAccount(client: QueryClient, me: { id: string; impersonatedBy?: string | null } | null) {
  const previous = client.getQueryData<{ id?: string; impersonatedBy?: string | null } | null>(meKey())
  if (previous === undefined || (previous?.id === me?.id && previous?.impersonatedBy === me?.impersonatedBy)) return false
  const privateQuery = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] !== 'me' &&
    !PUBLIC_APP_QUERIES.has(String(query.queryKey[0])) &&
    !PUBLIC_REFERENCE_QUERIES.has(String(query.queryKey[0]))
  void client.cancelQueries({ predicate: privateQuery })
  client.removeQueries({ predicate: privateQuery })
  // Sign-out clears the account's saved store, so an engine that read it before would refuse every later write.
  stopLocalRuntime()
  return true
}
