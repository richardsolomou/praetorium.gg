import { searchDatasheetEntries } from '../../core/datasheetSearch'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
import { searchReference, searchOwn } from '../../core/referenceSearch'
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

function restoredReference(key: 'PraetoriumOffline' | 'PraetoriumReferenceCache') {
  if (typeof window === 'undefined') return undefined
  const data = window[key]
  if (data && 'encoding' in data) return (window[key] = decompressReference(data) ?? undefined)
  return data
}

export function offlineData() {
  return restoredReference('PraetoriumOffline')
}

export function referenceData() {
  return offlineData() ?? restoredReference('PraetoriumReferenceCache')
}

export function referenceRead<T>(key: readonly unknown[], online: () => Promise<T>, current?: T): Promise<T> {
  if (typeof window !== 'undefined' && !navigator.onLine && current !== undefined) return Promise.resolve(current)
  const saved = referenceData()
  if (!saved) return online()
  const found = saved.queries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(key))
  if (navigator.onLine && !offlineData())
    return online().catch((error) => {
      if (current !== undefined) return current
      if (found) return found.data as T
      throw error
    })
  if (!found && navigator.onLine) return online()
  if (!found) return Promise.reject(new Error('This reference is unavailable in the saved download. Connect and refresh the reference.'))
  return Promise.resolve(found.data as T)
}

export function offlineSearch(query: string, client?: QueryClient) {
  const saved = referenceData()
  if (!saved) return null
  const read = <T>(key: string): T | undefined =>
    client?.getQueryData([key]) ?? (window.PraetoriumAppSnapshot?.queries.find((entry) => entry.key[0] === key)?.data as T | undefined)
  const owner = read<{ id: string } | null>('me')
  const factions =
    read<FactionIndex>('faction-index') ??
    (saved.queries.find((entry) => entry.key[0] === 'faction-index')?.data as FactionIndex | undefined)
  const rosters = (owner ? (read<Awaited<ReturnType<typeof savedRosterSummaries>>>('saved-roster-summaries') ?? []) : []).map((roster) => {
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
  const battles = owner
    ? (read<{ pages: Awaited<ReturnType<typeof myBattles>>[] }>('battles')?.pages.flatMap((page) => page.battles) ?? [])
    : []
  return [...searchReference(query, saved.search), ...searchOwn(query, { rosters, battles })]
}

export function offlineDatasheets(catalogueId: string, query: string) {
  const saved = referenceData()
  if (!saved) return null
  const units = saved.queries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(['faction-datasheets', catalogueId, '']))
    ?.data as UnitSummary[] | undefined
  const fields = new Map(saved.search.datasheets.map((entry) => [entry.result.id, entry.fields]))
  return searchDatasheetEntries(units ?? [], query, (unit) => fields.get(`datasheet:${catalogueId}:${unit.id}`) ?? null)
}
