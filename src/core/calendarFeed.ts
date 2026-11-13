/** The dates one player's calendar feed lists, as the product database reads them for that player. */
export type CalendarFeedDates = {
  leagues: { groupToken: string; groupName: string; publishedAt: number; deadlines: (number | null)[] }[]
  tournaments: { token: string; name: string; playsAt: number | null; sealBy: number | null }[]
}

type CalendarEntry = { uid: string; at: number; summary: string; url: string }

/** How often a calendar app should fetch the feed again; a changed date reaches the calendar within this. */
export const CALENDAR_REFRESH = 'PT6H'

export function calendarEntries({ leagues, tournaments }: CalendarFeedDates, origin: string): CalendarEntry[] {
  const host = new URL(origin).host
  const entries: CalendarEntry[] = []
  for (const league of leagues)
    for (const [index, at] of league.deadlines.entries())
      if (at !== null)
        entries.push({
          // A league that ends and starts again in the same group numbers its rounds from 1, so its publish time keeps them apart.
          uid: `league-${league.groupToken}-${league.publishedAt}-round-${index + 1}@${host}`,
          at,
          summary: `${league.groupName} league: round ${index + 1} deadline`,
          url: `${origin}/groups/${league.groupToken}?tab=league`,
        })
  for (const tournament of tournaments) {
    const url = `${origin}/tournaments/${tournament.token}`
    if (tournament.sealBy !== null)
      entries.push({
        uid: `tournament-${tournament.token}-rosters@${host}`,
        at: tournament.sealBy,
        summary: `${tournament.name}: rosters due`,
        url,
      })
    if (tournament.playsAt !== null)
      entries.push({ uid: `tournament-${tournament.token}-play@${host}`, at: tournament.playsAt, summary: tournament.name, url })
  }
  return entries.sort((one, other) => one.at - other.at)
}

/** An iCalendar (RFC 5545) document of the player's dates. Each date is a moment, so its event has a start and no end. */
export function calendarFeedText(dates: CalendarFeedDates, origin: string, now: number) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Praetorium//Calendar feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Praetorium',
    `REFRESH-INTERVAL;VALUE=DURATION:${CALENDAR_REFRESH}`,
    `X-PUBLISHED-TTL:${CALENDAR_REFRESH}`,
  ]
  for (const entry of calendarEntries(dates, origin))
    lines.push(
      'BEGIN:VEVENT',
      `UID:${entry.uid}`,
      `DTSTAMP:${utcTime(now)}`,
      `DTSTART:${utcTime(entry.at)}`,
      `SUMMARY:${escapeText(entry.summary)}`,
      `URL:${entry.url}`,
      'END:VEVENT',
    )
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}

const utcTime = (at: number) => `${new Date(at).toISOString().slice(0, 19).replaceAll(/[-:]/g, '')}Z`

const escapeText = (text: string) => text.replaceAll(/[\\;,]/g, (character) => `\\${character}`).replaceAll(/\r?\n/g, '\\n')

/** Splits a line longer than 75 octets into continuation lines, never inside a character. */
function fold(line: string) {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let part = ''
  let octets = 0
  for (const character of line) {
    const size = encoder.encode(character).length
    // A continuation line starts with a space, which counts toward its 75.
    if (octets + size > (parts.length ? 74 : 75)) {
      parts.push(part)
      part = ''
      octets = 0
    }
    part += character
    octets += size
  }
  parts.push(part)
  return parts.join('\r\n ')
}
