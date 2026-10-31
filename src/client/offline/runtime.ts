import { searchDatasheetEntries } from '../../core/datasheetSearch'
import {
  MAX_REFERENCE_PART_BYTES,
  referencePart,
  type OfflineAssets,
  type OfflineReferenceData,
  type OfflineReferenceVersion,
  type ReferenceQuery,
} from '../../contracts/offlineReference'
import { ownSearchLists, prepareReferenceSearch, searchAll, type GlobalSearchIndex } from '../../core/referenceSearch'
import type { QueryClient } from '@tanstack/react-query'
import type { savedRosterSummaries, myBattles, factionIndex } from '../functions'
type FactionIndex = NonNullable<Awaited<ReturnType<typeof factionIndex>>>
import type { FactionDatasheet } from '../../contracts/catalogue'
import { readPart } from './referenceStore'
import { battlesKey, factionDatasheetsKey, factionIndexKey, meKey, savedRosterSummariesKey } from '../queries/queryKeys'

declare global {
  interface Window {
    PraetoriumOffline?: OfflineReferenceData
    PraetoriumOfflineAssets?: OfflineAssets
    /** The download this page restored; the native shell may have injected an earlier release's in its place. */
    PraetoriumReferenceCache?: OfflineReferenceData | { version?: unknown }
    PraetoriumOfflineStart?: string
  }
}

/** The saved offline application's download, when this page is that application. */
export function offlineData() {
  return typeof window === 'undefined' ? undefined : window.PraetoriumOffline
}

export function offlineAssets() {
  return typeof window === 'undefined' ? undefined : window.PraetoriumOfflineAssets
}

/** The download in use, if any. */
export function referenceData(): OfflineReferenceData | undefined {
  if (typeof window === 'undefined') return undefined
  const cached = window.PraetoriumReferenceCache
  return offlineData() ?? (cached?.version === 2 ? (cached as OfflineReferenceData) : undefined)
}

let published: string | null = null
const referenceListeners = new Set<() => void>()

/** Records what the service last published, which decides whether the download still matches it. */
export function setPublishedReference(manifest: Pick<OfflineReferenceVersion, 'revision'> | null) {
  published = manifest?.revision ?? null
  referenceChanged()
}

/** Tells subscribers that the download in use, what the service publishes, or the decoded search changed. */
export function referenceChanged() {
  for (const listener of referenceListeners) listener()
}

export function subscribeReference(listener: () => void) {
  referenceListeners.add(listener)
  return () => void referenceListeners.delete(listener)
}

/**
 * The downloaded reference when it answers exactly as the service would: the saved offline application,
 * or a download whose revision the service still publishes.
 */
export function currentReference() {
  const saved = referenceData()
  return saved && (offlineData() || saved.download.revision === published) ? saved : undefined
}

/** Whether a part the device has not stored may be read from the service instead. */
export const partsReachable = () => navigator.onLine && !offlineData()

/** Decoded parts by address, least recently read first. Pages read a handful at a time, so only these stay decoded. */
const decoded = new Map<string, { value?: unknown; read: Promise<unknown> }>()
export const MAX_DECODED_PARTS = 6

/** Decodes a part of the download, keeping the few read last so pages reading the same parts do not decode them again. */
export function loadPart(asset: string, limit = MAX_REFERENCE_PART_BYTES): Promise<unknown> {
  let entry = decoded.get(asset)
  if (entry) decoded.delete(asset)
  else {
    const loading: { value?: unknown; read: Promise<unknown> } = { read: readPart(asset, limit, partsReachable()) }
    loading.read.then(
      (value) => void (loading.value = value),
      () => void (decoded.get(asset) === loading && decoded.delete(asset)),
    )
    entry = loading
  }
  decoded.set(asset, entry)
  for (const oldest of decoded.keys()) {
    if (decoded.size <= MAX_DECODED_PARTS) break
    decoded.delete(oldest)
  }
  return entry.read
}

/** A part already decoded, without reading storage. */
export const decodedPart = (asset: string) => decoded.get(asset)?.value

const partAsset = (saved: OfflineReferenceData, key: readonly unknown[]) => {
  const part = referencePart(key)
  return part === null ? saved.download.reference.core : (saved.download.reference.parts[part] ?? null)
}

const queryIndexes = new WeakMap<object, Map<string, unknown>>()
function queryIn<T>(part: unknown, key: readonly unknown[]) {
  let index = queryIndexes.get(part as object)
  if (!index)
    queryIndexes.set(part as object, (index = new Map((part as ReferenceQuery[]).map((entry) => [JSON.stringify(entry.key), entry.data]))))
  return index.get(JSON.stringify(key)) as T | undefined
}

/** One saved query's data when its part is decoded; otherwise undefined, and its part starts decoding for the next read. */
export function savedQuery<T>(saved: OfflineReferenceData | undefined, key: readonly unknown[]): T | undefined {
  const asset = saved && partAsset(saved, key)
  if (!asset) return undefined
  const part = decodedPart(asset)
  if (part !== undefined) return queryIn<T>(part, key)
  void loadPart(asset).catch(() => {})
  return undefined
}

/** One saved query's data, decoding its part; undefined when the download lacks it or the part is unreadable. */
export async function loadSavedQuery<T>(saved: OfflineReferenceData | undefined, key: readonly unknown[]): Promise<T | undefined> {
  const asset = saved && partAsset(saved, key)
  return asset ? queryIn<T>(await loadPart(asset).catch(() => undefined), key) : undefined
}

export async function referenceRead<T>(key: readonly unknown[], online: () => Promise<T>, current?: T): Promise<T> {
  if (typeof window !== 'undefined' && !navigator.onLine && current !== undefined) return current
  const saved = referenceData()
  if (!saved) return online()
  const found = await loadSavedQuery<T>(saved, key)
  if (found !== undefined && currentReference()) return found
  if (navigator.onLine && !offlineData())
    return online().catch((error) => {
      if (current !== undefined) return current
      if (found !== undefined) return found
      throw error
    })
  if (found === undefined && navigator.onLine) return online()
  if (found === undefined) throw new Error('This reference is unavailable in the saved download. Connect and refresh the reference.')
  return found
}

type OwnLists = {
  owner: { id: string } | null | undefined
  rosters: Awaited<ReturnType<typeof savedRosterSummaries>> | undefined
  battles: { pages: Awaited<ReturnType<typeof myBattles>>[] } | undefined
}

/** The download's search index when decoded. */
export function decodedSearch(saved = referenceData()) {
  return saved && (decodedPart(saved.download.reference.search) as GlobalSearchIndex | undefined)
}

const preparedSearch = new WeakSet<GlobalSearchIndex>()

/**
 * Decodes the download's search index and prepares it while the page is idle, a slice at a time, so the first search
 * a player types is as fast as the rest. It is read only once a player searches, which is when this is called.
 */
export async function loadSearch(saved = referenceData()) {
  if (!saved) return undefined
  const search = (await loadPart(saved.download.reference.search)) as GlobalSearchIndex
  referenceChanged()
  if (!preparedSearch.has(search)) {
    preparedSearch.add(search)
    const steps = prepareReferenceSearch(search)
    const schedule = () => (window.requestIdleCallback ? window.requestIdleCallback(step, { timeout: 5_000 }) : setTimeout(step, 0))
    const step = () => {
      if (!steps.next().done) schedule()
    }
    schedule()
  }
  return search
}

export function offlineSearch(query: string, client?: QueryClient) {
  const saved = referenceData()
  const search = decodedSearch(saved)
  if (!saved || !search) return null
  const read = <T>(key: readonly unknown[]): T | undefined =>
    client?.getQueryData(key) ?? (window.PraetoriumAppSnapshot?.queries.find((entry) => entry.key[0] === key[0])?.data as T | undefined)
  return searchDownload(query, read<FactionIndex>(factionIndexKey()), {
    owner: read(meKey()),
    rosters: read(savedRosterSummariesKey()),
    battles: read(battlesKey()),
  })
}

/** Global search over the downloaded reference and the player's own loaded lists, as the service answers it, once its index is decoded. */
export function searchDownload(query: string, factionIndex: FactionIndex | undefined, own: OwnLists) {
  const saved = referenceData()
  const search = decodedSearch(saved)
  if (!saved || !search) return null
  const factions = factionIndex ?? savedQuery<FactionIndex>(saved, factionIndexKey())
  const lists = own.owner
    ? ownSearchLists(own.rosters ?? [], own.battles?.pages.flatMap((page) => page?.battles ?? []) ?? [], factions?.factions ?? [])
    : null
  return searchAll(query, search, lists)
}

const datasheetFields = new WeakMap<GlobalSearchIndex, Map<string, GlobalSearchIndex['datasheets'][number]['fields']>>()

function datasheetsIn(units: FactionDatasheet[], search: GlobalSearchIndex | undefined, catalogueId: string, query: string) {
  if (query.trim() && !search) return null
  let fields = search && datasheetFields.get(search)
  if (search && !fields) datasheetFields.set(search, (fields = new Map(search.datasheets.map((entry) => [entry.result.id, entry.fields]))))
  return searchDatasheetEntries(units, query, (unit) => fields?.get(`datasheet:${catalogueId}:${unit.id}`) ?? null)
}

/** A faction's datasheets matching `query` when their parts are decoded; a query also needs the search index. */
export function offlineDatasheets(catalogueId: string, query: string) {
  const saved = referenceData()
  const units = savedQuery<FactionDatasheet[]>(saved, factionDatasheetsKey(catalogueId, ''))
  return units ? datasheetsIn(units, query.trim() ? decodedSearch(saved) : undefined, catalogueId, query) : null
}

export async function loadOfflineDatasheets(catalogueId: string, query: string) {
  const saved = referenceData()
  const units = await loadSavedQuery<FactionDatasheet[]>(saved, factionDatasheetsKey(catalogueId, ''))
  if (!units) return null
  return datasheetsIn(units, query.trim() ? await loadSearch(saved).catch(() => undefined) : undefined, catalogueId, query)
}
