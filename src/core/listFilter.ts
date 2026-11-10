import { z } from 'zod'

/** One filter's choices: a row must carry one of `in`, when there are any, and none of `out`. */
export type Facet = { in: string[]; out: string[] }

const MAX_FACET_VALUES = 40
const facetValue = z.string().min(1).max(128)

/** A bare value is what clients from before multiple choices send. */
export const facetSchema = z
  .preprocess(
    (value) => (typeof value === 'string' ? { in: [value] } : value),
    z.strictObject({
      in: z.array(facetValue).max(MAX_FACET_VALUES).default([]),
      out: z.array(facetValue).max(MAX_FACET_VALUES).default([]),
    }),
  )
  .optional()

export const facetActive = (facet: Facet | undefined): facet is Facet => Boolean(facet && (facet.in.length || facet.out.length))

export function facetMatches(facet: Facet | undefined, values: readonly string[]) {
  if (!facetActive(facet)) return true
  return (!facet.in.length || facet.in.some((value) => values.includes(value))) && !facet.out.some((value) => values.includes(value))
}

const decoded = (text: string) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * Reads the address form: comma-separated, with `!` before an excluded value. A link from before multiple choices is one
 * value, and a lone number stays a number, or the router would write it in quotes.
 */
export function parseFacet(raw: unknown): Facet | undefined {
  const text = typeof raw === 'number' ? String(raw) : raw
  if (typeof text !== 'string' || !text || text.length > 2_000) return undefined
  const parts = text.split(',').filter(Boolean).slice(0, MAX_FACET_VALUES)
  const facet = {
    in: parts.filter((part) => !part.startsWith('!')).map(decoded),
    out: parts.filter((part) => part.startsWith('!')).map((part) => decoded(part.slice(1))),
  }
  return facetActive(facet) ? facet : undefined
}

export type FacetAddress = string | number

export function facetText(facet: Facet | undefined): FacetAddress | undefined {
  if (!facetActive(facet)) return undefined
  const text = [...facet.in.map(encodeURIComponent), ...facet.out.map((value) => `!${encodeURIComponent(value)}`)].join(',')
  return /^[1-9]\d*$/.test(text) ? Number(text) : text
}

export const PERIODS = ['7d', '30d', '90d', '1y'] as const
export type Period = (typeof PERIODS)[number]
const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }
const DAY_MS = 86_400_000
const dayPattern = /^\d{4}-\d{2}-\d{2}$/

export const parseDay = (raw: unknown) =>
  typeof raw === 'string' && dayPattern.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : undefined

export const periodFields = {
  period: z.enum(PERIODS).optional(),
  from: z.string().regex(dayPattern).optional(),
  to: z.string().regex(dayPattern).optional(),
}
export type PeriodFilter = { period?: Period; from?: string; to?: string }

/** The instants a period covers, `to` exclusive; calendar days are UTC so one link means the same battles to every reader. */
export function periodBounds({ period, from, to }: PeriodFilter, now: number): { from?: number; to?: number } {
  if (period) return { from: Math.floor(now / DAY_MS) * DAY_MS - PERIOD_DAYS[period] * DAY_MS }
  return {
    ...(from ? { from: Date.parse(`${from}T00:00:00Z`) } : {}),
    ...(to ? { to: Date.parse(`${to}T00:00:00Z`) + DAY_MS } : {}),
  }
}

export const withinPeriod = (at: number, bounds: { from?: number; to?: number }) =>
  (bounds.from === undefined || at >= bounds.from) && (bounds.to === undefined || at < bounds.to)

export const LIST_FILTER_SCOPES = [
  'battles:mine',
  'battles:friends',
  'battles:public',
  'battles:player',
  'battles:group',
  'battles:tournament',
  'rosters:mine',
  'rosters:friends',
  'rosters:public',
  'rosters:played',
  'rosters:player',
] as const
export type ListFilterScope = (typeof LIST_FILTER_SCOPES)[number]

export const MAX_SAVED_VIEWS = 12
export const SAVED_VIEW_NAME_MAX_LENGTH = 40
const MAX_FILTERS_ADDRESSED = 32
export const LIST_PREFERENCES_MAX_LENGTH = 64_000

/** Which filters a player keeps in a list's bar, null for the list's own choice, and the views they saved for it. */
export const listPreferencesSchema = z.object({
  pinned: z.array(z.string().max(64)).max(MAX_FILTERS_ADDRESSED).nullable().default(null),
  views: z
    .array(
      z.object({
        name: z.string().min(1).max(SAVED_VIEW_NAME_MAX_LENGTH),
        address: z
          .record(z.string().max(64), z.union([z.string().max(2_400), z.number()]))
          .refine((address) => Object.keys(address).length <= MAX_FILTERS_ADDRESSED),
      }),
    )
    .max(MAX_SAVED_VIEWS)
    .default([]),
})
export type ListPreferences = z.infer<typeof listPreferencesSchema>
