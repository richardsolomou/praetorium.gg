import { describe, expect, it } from 'vitest'
import { calendarFeedText } from './calendarFeed'

const NOW = Date.UTC(2026, 10, 13, 12)

describe('calendarFeedText', () => {
  it('lists set deadlines and tournament dates, and leaves out unset ones', () => {
    const text = calendarFeedText(
      {
        leagues: [{ groupToken: 'g1', groupName: 'Tuesday', publishedAt: 1, deadlines: [Date.UTC(2026, 10, 20, 19), null] }],
        tournaments: [{ token: 't1', name: 'Open', playsAt: Date.UTC(2026, 11, 5, 9), sealBy: null }],
      },
      'https://praetorium.gg',
      NOW,
    )
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(text).toContain('DTSTART:20261120T190000Z\r\nSUMMARY:Tuesday league: round 1 deadline\r\n')
    expect(text).toContain('URL:https://praetorium.gg/groups/g1?tab=league\r\n')
    expect(text).toContain('DTSTART:20261205T090000Z\r\nSUMMARY:Open\r\n')
    expect(text).not.toContain('round 2')
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('escapes names and folds long lines without splitting a character', () => {
    const name = `Grand Tournament, Day 1; "Sector\\Prime" ${'⚔'.repeat(30)}`
    const text = calendarFeedText({ leagues: [], tournaments: [{ token: 't', name, playsAt: NOW, sealBy: null }] }, 'https://x.test', NOW)
    const lines = text.split('\r\n')
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    const summary = lines
      .slice(lines.findIndex((line) => line.startsWith('SUMMARY:')))
      .join('\r\n')
      .split('\r\nURL:')[0]!
    expect(summary.replaceAll('\r\n ', '')).toBe(`SUMMARY:Grand Tournament\\, Day 1\\; "Sector\\\\Prime" ${'⚔'.repeat(30)}`)
  })
})
