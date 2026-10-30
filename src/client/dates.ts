import { useHydrated } from './useClientValue'

/** The one date format every screen shows, so lists agree on how a moment reads. */
const dateOptions = { day: 'numeric', month: 'short', year: 'numeric' } as const
export const formatDate = (at: string | number | Date) => new Date(at).toLocaleDateString(undefined, dateOptions)

/** The one time-of-day format, for entries inside a single day's report. */
export const formatTime = (at: string | number | Date) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const ago = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS = [
  ['minute', 60_000],
  ['hour', 3_600_000],
  ['day', 86_400_000],
] as const

/** How long ago a moment was, for activity that matters by recency; past a week it reads as a date. */
export function formatAgo(at: string | number | Date, now = Date.now()) {
  const elapsed = now - new Date(at).getTime()
  if (elapsed >= 7 * 86_400_000) return formatDate(at)
  if (elapsed < 60_000) return ago.format(0, 'second')
  const [unit, size] = UNITS.findLast(([, step]) => elapsed >= step)!
  return ago.format(-Math.round(elapsed / size), unit)
}

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

/** A date and time of day, such as "2 Nov 2026, 18:00". */
export function useMoment() {
  const { date, time } = useDateFormatting()
  return (at: number) => `${date(at)}, ${time(at)}`
}

/** A moment as a `datetime-local` field holds it, in the reader's own timezone. */
export const inputMoment = (at: number | null) => {
  if (at === null) return ''
  const date = new Date(at)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export const momentFromInput = (text: string) => (text ? new Date(text).getTime() : null)
