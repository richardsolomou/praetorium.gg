import { searchDatasheetEntries } from '../../core/datasheetSearch'
import type { OfflineReferenceData, OfflineReferenceVersion } from '../../contracts/offlineReference'
import { ownSearchLists, prepareReferenceSearch, searchAll } from '../../core/referenceSearch'
import type { QueryClient } from '@tanstack/react-query'
import type { savedRosterSummaries, myBattles, factionIndex } from '../functions'
type FactionIndex = NonNullable<Awaited<ReturnType<typeof factionIndex>>>
import type { UnitSummary } from '../../contracts/catalogue'
import { decompressReference, type CompressedReference } from './compressedReference'
import { battlesKey, factionDatasheetsKey, factionIndexKey, meKey, savedRosterSummariesKey } from '../queries/queryKeys'

declare global {
  interface Window {
    PraetoriumOffline?: OfflineReferenceData | CompressedReference
    PraetoriumReferenceCache?: OfflineReferenceData | CompressedReference
    PraetoriumOfflineStart?: string
  }
}

export function offlineData() {
  if (typeof window === 'undefined') return undefined
  const data = window.PraetoriumOffline
  // The saved offline application has nothing else to read, so it decodes its download as it starts.
  if (data && 'encoding' in data) return (window.PraetoriumOffline = decompressReference(data) ?? undefined)
  return data
}

/** The download in use, if any; a hosted page reads one the native shell injected only once it has been decoded in the background. */
export function referenceData() {
  if (typeof window === 'undefined') return undefined
  const cached = window.PraetoriumReferenceCache
  return offlineData() ?? (cached && !('encoding' in cached) ? cached : undefined)
}

let published: { revision: string; construction: readonly string[] } | null = null
const referenceListeners = new Set<() => void>()

/** Records what the service last published, which decides whether the download still matches it. */
export function setPublishedReference(manifest: Pick<OfflineReferenceVersion, 'revision' | 'construction'> | null) {
  published = manifest && { revision: manifest.revision, construction: [manifest.construction.current, manifest.construction.complete] }
  referenceChanged()
}

/** Tells subscribers that the download in use, or what the service publishes, changed. */
export function referenceChanged() {
  for (const listener of referenceListeners) listener()
}

export function subscribeReference(listener: () => void) {
  referenceListeners.add(listener)
  return () => void referenceListeners.delete(listener)
}

/**
 * The downloaded reference when it answers exactly as the service would: the saved offline application,
 * or a cached download whose revision the service still publishes.
 */
export function currentReference() {
  const saved = referenceData()
  return saved && (offlineData() || (published !== null && saved.revision === published.revision)) ? saved : undefined
}

/**
 * The current download's construction asset while the service still publishes it. A download keeps an older asset
 * while a newer one downloads, for offline use, so a current reference alone does not make its construction current.
 */
export function currentConstruction() {
  const url = currentReference()?.constructionBundle
  return url && published?.construction.includes(url) ? url : undefined
}

const queryIndexes = new WeakMap<OfflineReferenceData, Map<string, OfflineReferenceData['queries'][number]>>()

/** One saved query's data by its key, through an index built once per download; reading it may parse it. */
export function savedQuery<T>(saved: OfflineReferenceData | undefined, key: readonly unknown[]): T | undefined {
  if (!saved) return undefined
  let index = queryIndexes.get(saved)
  if (!index) {
    index = new Map(saved.queries.map((entry) => [JSON.stringify(entry.key), entry]))
    queryIndexes.set(saved, index)
  }
  return index.get(JSON.stringify(key))?.data as T | undefined
}

export function referenceRead<T>(key: readonly unknown[], online: () => Promise<T>, current?: T): Promise<T> {
  if (typeof window !== 'undefined' && !navigator.onLine && current !== undefined) return Promise.resolve(current)
  const saved = referenceData()
  if (!saved) return online()
  const found = savedQuery<T>(saved, key)
  if (found !== undefined && currentReference()) return Promise.resolve(found)
  if (navigator.onLine && !offlineData())
    return online().catch((error) => {
      if (current !== undefined) return current
      if (found !== undefined) return found
      throw error
    })
  if (found === undefined && navigator.onLine) return online()
  if (found === undefined)
    return Promise.reject(new Error('This reference is unavailable in the saved download. Connect and refresh the reference.'))
  return Promise.resolve(found)
}

type OwnLists = {
  owner: { id: string } | null | undefined
  rosters: Awaited<ReturnType<typeof savedRosterSummaries>> | undefined
  battles: { pages: Awaited<ReturnType<typeof myBattles>>[] } | undefined
}

export function offlineSearch(query: string, client?: QueryClient) {
  if (!referenceData()) return null
  const read = <T>(key: readonly unknown[]): T | undefined =>
    client?.getQueryData(key) ?? (window.PraetoriumAppSnapshot?.queries.find((entry) => entry.key[0] === key[0])?.data as T | undefined)
  return searchDownload(query, read<FactionIndex>(factionIndexKey()), {
    owner: read(meKey()),
    rosters: read(savedRosterSummariesKey()),
    battles: read(battlesKey()),
  })
}

/** Global search over the downloaded reference and the player's own loaded lists, as the service answers it. */
export function searchDownload(query: string, factionIndex: FactionIndex | undefined, own: OwnLists) {
  const saved = referenceData()
  if (!saved) return null
  const factions = factionIndex ?? savedQuery<FactionIndex>(saved, factionIndexKey())
  const lists = own.owner
    ? ownSearchLists(own.rosters ?? [], own.battles?.pages.flatMap((page) => page?.battles ?? []) ?? [], factions?.factions ?? [])
    : null
  return searchAll(query, saved.search, lists)
}

/** Prepares search while the page is idle, a slice at a time, so the first search a player types is as fast as the rest. */
export function warmDownloadSearch() {
  const saved = referenceData()
  if (!saved) return
  const steps = prepareReferenceSearch(saved.search)
  const schedule = () => (window.requestIdleCallback ? window.requestIdleCallback(step, { timeout: 5_000 }) : setTimeout(step, 0))
  const step = () => {
    if (!steps.next().done) schedule()
  }
  schedule()
}

const datasheetFields = new WeakMap<OfflineReferenceData, Map<string, OfflineReferenceData['search']['datasheets'][number]['fields']>>()

export function offlineDatasheets(catalogueId: string, query: string) {
  const saved = referenceData()
  if (!saved) return null
  const units = savedQuery<UnitSummary[]>(saved, factionDatasheetsKey(catalogueId, ''))
  let fields = datasheetFields.get(saved)
  if (!fields) {
    fields = new Map(saved.search.datasheets.map((entry) => [entry.result.id, entry.fields]))
    datasheetFields.set(saved, fields)
  }
  return searchDatasheetEntries(units ?? [], query, (unit) => fields.get(`datasheet:${catalogueId}:${unit.id}`) ?? null)
}
