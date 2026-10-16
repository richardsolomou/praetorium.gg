import { useHydrated } from './useClientValue'

/** The one date format every screen shows, so lists agree on how a moment reads. */
const dateOptions = { day: 'numeric', month: 'short', year: 'numeric' } as const
export const formatDate = (at: string | number | Date) => new Date(at).toLocaleDateString(undefined, dateOptions)

/** The one time-of-day format, for entries inside a single day's report. */
export const formatTime = (at: string | number | Date) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** A calendar day such as `2026-10-03`, which names the same day in every timezone. */
const formatDay = (day: string, locale?: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { ...dateOptions, timeZone: 'UTC' })

const utc = {
  date: (at: string | number | Date) => new Date(at).toLocaleDateString('en-GB', { ...dateOptions, timeZone: 'UTC' }),
  day: (day: string) => formatDay(day, 'en-GB'),
  time: (at: string | number | Date) => new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
}

const local = { date: formatDate, time: formatTime, day: (day: string) => formatDay(day) }
/** Match the server's first frame, then show dates in the reader's timezone. */
export function useDateFormatting() {
  return useHydrated() ? local : utc
}
