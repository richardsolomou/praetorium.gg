import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { formatAgo, formatDate, formatTime, useDateFormatting } from './dates'

it('renders dates and times consistently before hydration while retaining local display', () => {
  const previousTimeZone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const at = '2026-09-20T00:30:00Z'
    function Timestamp() {
      const { date, time } = useDateFormatting()
      return createElement('span', null, `${date(at)} ${time(at)}`)
    }

    expect(renderToStaticMarkup(createElement(Timestamp))).toBe('<span>20 Sept 2026 12:30 AM</span>')
    expect(`${formatDate(at)} ${formatTime(at)}`).toBe('Sep 19, 2026 05:30 PM')
  } finally {
    process.env.TZ = previousTimeZone
  }
})

it.each([
  [30_000, 'now'],
  [5 * 60_000, '5 minutes ago'],
  [3 * 3_600_000, '3 hours ago'],
  [30 * 3_600_000, 'yesterday'],
  [6 * 86_400_000, '6 days ago'],
])('reads a moment %i ms ago as "%s"', (elapsed, text) => {
  const now = Date.parse('2026-10-24T12:00:00Z')
  expect(formatAgo(now - elapsed, now)).toBe(text)
})

it('dates a moment more than a week ago instead of counting days', () => {
  const now = Date.parse('2026-10-24T12:00:00Z')
  expect(formatAgo(now - 8 * 86_400_000, now)).toBe(formatDate(now - 8 * 86_400_000))
})
