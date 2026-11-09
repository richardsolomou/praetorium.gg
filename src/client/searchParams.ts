import { facetText, parseDay, parseFacet, PERIODS, type Facet, type FacetAddress, type PeriodFilter } from '../core/listFilter'

/** A search flag as the router parses it from `?flag=true`, or as code passes it. */
export const searchFlag = (value: unknown) => value === true || value === 'true'

/** A search value as text, or undefined when it is empty, longer than `max`, or not text at all. */
export const searchText = (value: unknown, max = Infinity) =>
  typeof value === 'string' && value && value.length <= max ? value : undefined

/** The named filters of an address in their one written form, leaving out anything unreadable. */
export function facetSearch<Key extends string>(search: Record<string, unknown>, keys: readonly Key[]) {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const text = facetText(parseFacet(search[key]))
      return text ? [[key, text]] : []
    }),
  ) as Partial<Record<Key, FacetAddress>>
}

export function facetsOf<Key extends string>(search: Partial<Record<Key, FacetAddress>>, keys: readonly Key[]) {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const facet = parseFacet(search[key])
      return facet ? [[key, facet]] : []
    }),
  ) as Partial<Record<Key, Facet>>
}

export function periodSearch(search: Record<string, unknown>): PeriodFilter {
  const period = PERIODS.find((known) => known === search.period)
  if (period) return { period }
  const from = parseDay(search.from)
  const to = parseDay(search.to)
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) }
}
