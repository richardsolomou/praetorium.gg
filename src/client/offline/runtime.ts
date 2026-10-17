import { searchDatasheetEntries } from '../../core/datasheetSearch'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
import { prepareReferenceSearch, searchReference, searchOwn } from '../../core/referenceSearch'
import { rosterLabel } from '../../core/rosterLabel'
import type { QueryClient } from '@tanstack/react-query'
import type { savedRosterSummaries, myBattles, factionIndex } from '../functions'
type FactionIndex = NonNullable<Awaited<ReturnType<typeof factionIndex>>>
import type { UnitSummary } from '../../contracts/catalogue'
import { decompressReference, type CompressedReference } from './compressedReference'

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

let publishedRevision: string | null = null
const revisionListeners = new Set<() => void>()

/** Records the reference revision the service last published, which decides whether the download still matches it. */
export function setPublishedReferenceRevision(revision: string | null) {
  publishedRevision = revision
  for (const listener of revisionListeners) listener()
}

export function subscribePublishedReferenceRevision(listener: () => void) {
  revisionListeners.add(listener)
  return () => void revisionListeners.delete(listener)
}

/**
 * The downloaded reference when it answers exactly as the service would: the saved offline application,
 * or a cached download whose revision the service still publishes.
 */
export function currentReference() {
  const saved = referenceData()
  return saved && (offlineData() || saved.revision === publishedRevision) ? saved : undefined
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
  const read = <T>(key: string): T | undefined =>
    client?.getQueryData([key]) ?? (window.PraetoriumAppSnapshot?.queries.find((entry) => entry.key[0] === key)?.data as T | undefined)
  return searchDownload(query, read<FactionIndex>('faction-index'), {
    owner: read('me'),
    rosters: read('saved-roster-summaries'),
    battles: read('battles'),
  })
}

/** Global search over the downloaded reference and the player's own loaded lists. */
export function searchDownload(query: string, factionIndex: FactionIndex | undefined, own: OwnLists) {
  const saved = referenceData()
  if (!saved) return null
  const factions = factionIndex ?? savedQuery<FactionIndex>(saved, ['faction-index'])
  const rosters = (own.owner ? (own.rosters ?? []) : []).map((roster) => {
    const faction = factions?.factions.find((entry) => entry.id === roster.catalogueId)
    return {
      ...roster,
      label: faction
        ? rosterLabel({
            factionName: faction.displayName,
            detachmentNames: roster.detachmentIds.flatMap((id) =>
              faction.detachments.filter((entry) => entry.id === id).map((entry) => entry.name),
            ),
            limit: roster.limit,
          })
        : '',
    }
  })
  const battles = own.owner ? (own.battles?.pages.flatMap((page) => page.battles) ?? []) : []
  return [...searchReference(query, saved.search), ...searchOwn(query, { rosters, battles })]
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
  const units = savedQuery<UnitSummary[]>(saved, ['faction-datasheets', catalogueId, ''])
  let fields = datasheetFields.get(saved)
  if (!fields) {
    fields = new Map(saved.search.datasheets.map((entry) => [entry.result.id, entry.fields]))
    datasheetFields.set(saved, fields)
  }
  return searchDatasheetEntries(units ?? [], query, (unit) => {
    const entry = fields.get(`datasheet:${catalogueId}:${unit.id}`)
    return entry ? { ...entry, abilityDescriptions: undefined } : null
  })
}
