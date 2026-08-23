/** The one date format every screen shows, so lists agree on how a moment reads. */
export const formatDate = (at: string | number | Date) => new Date(at).toLocaleDateString()

/** The one time-of-day format, for entries inside a single day's report. */
export const formatTime = (at: string | number | Date) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
