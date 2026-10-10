import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { formatDate, formatTime, useDateFormatting } from './dates'

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
