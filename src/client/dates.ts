import { useSyncExternalStore } from 'react'

/** The one date format every screen shows, so lists agree on how a moment reads. */
const dateOptions = { day: 'numeric', month: 'short', year: 'numeric' } as const
export const formatDate = (at: string | number | Date) => new Date(at).toLocaleDateString(undefined, dateOptions)

/** The one time-of-day format, for entries inside a single day's report. */
export const formatTime = (at: string | number | Date) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const utc = {
  date: (at: string | number | Date) => new Date(at).toLocaleDateString('en-GB', { ...dateOptions, timeZone: 'UTC' }),
  time: (at: string | number | Date) => new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
}

const local = { date: formatDate, time: formatTime }
const subscribe = () => () => {}

/** Match the server's first frame, then show dates in the reader's timezone. */
export function useDateFormatting() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  return hydrated ? local : utc
}
