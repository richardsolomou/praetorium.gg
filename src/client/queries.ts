import { queryOptions } from '@tanstack/react-query'
import { factions, me, openBattle, priceRoster, units } from '../server/fns'

export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => me() })

// No polling: `useLiveBattle` refetches this when the server says the battle changed.
export const battleQuery = (token: string) => queryOptions({ queryKey: ['battle', token], queryFn: () => openBattle({ data: { token } }) })

export const factionsQuery = () => queryOptions({ queryKey: ['factions'], queryFn: () => factions(), staleTime: Infinity })

export const unitsQuery = (catalogueId: string, query: string) =>
  queryOptions({
    queryKey: ['units', catalogueId, query],
    queryFn: () => units({ data: { catalogueId, query } }),
    enabled: Boolean(catalogueId),
  })

/** Keyed on the picks, so the price follows the list without anything having to remember to ask. */
export const priceQuery = (catalogueId: string, entryIds: readonly string[]) =>
  queryOptions({
    queryKey: ['price', catalogueId, entryIds],
    queryFn: () => priceRoster({ data: { catalogueId, entryIds: [...entryIds] } }),
    enabled: Boolean(catalogueId),
  })
