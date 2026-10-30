import { useMemo } from 'react'
import { z } from 'zod'
import type { GlobalSearchResult } from '../../functions'
import { parseStored, readStoredValue, useStoredValue, writeStoredValue } from '../../storedValue'

const KEY = 'praetorium:recent-searches'
const LIMIT = 8
/** The player's own rosters and battles are left out, so nothing private outlives signing out on a shared device. */
const REMEMBERED = new Set<GlobalSearchResult['group']>(['Pages', 'Factions', 'Datasheets', 'Detachments', 'Missions', 'Rules'])

type RecentSearch = Pick<GlobalSearchResult, 'id' | 'group' | 'label' | 'detail' | 'href' | 'faction'>

const isRecentSearch = (value: unknown): value is RecentSearch => {
  const entry = value as Partial<RecentSearch> | null
  return (
    typeof entry?.id === 'string' &&
    REMEMBERED.has(entry.group!) &&
    typeof entry.label === 'string' &&
    typeof entry.detail === 'string' &&
    typeof entry.href === 'string' &&
    entry.href.startsWith('/') &&
    !entry.href.startsWith('//')
  )
}

const recentSearchesSchema = z.array(z.unknown()).transform((entries) => entries.filter(isRecentSearch).slice(0, LIMIT))

export const parseRecentSearches = (raw: string | null): RecentSearch[] => parseStored(recentSearchesSchema, raw) ?? []

export function withRecentSearch(recent: readonly RecentSearch[], result: GlobalSearchResult): RecentSearch[] {
  const { id, group, label, detail, href, faction } = result
  const entry: RecentSearch = { id, group, label, detail, href, ...(faction ? { faction } : {}) }
  if (!isRecentSearch(entry)) return [...recent]
  return [entry, ...recent.filter((existing) => existing.id !== id)].slice(0, LIMIT)
}

export const withoutRecentSearch = (recent: readonly RecentSearch[], id: string) => recent.filter((entry) => entry.id !== id)

const stored = () => parseRecentSearches(readStoredValue(KEY))
const store = (recent: readonly RecentSearch[]) => writeStoredValue(KEY, recent.length ? JSON.stringify(recent) : null)

export const rememberSearch = (result: GlobalSearchResult) => store(withRecentSearch(stored(), result))
export const forgetSearch = (id: string) => store(withoutRecentSearch(stored(), id))
export const clearRecentSearches = () => store([])

/** This device's recently opened search results, newest first, kept current across tabs. */
export function useRecentSearches() {
  const raw = useStoredValue(KEY)
  return useMemo(() => parseRecentSearches(raw), [raw])
}
