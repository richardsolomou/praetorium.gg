import { describe, expect, it } from 'vitest'
import { leagueRosterBundle, SEALED_COPIES_NOTICE } from './leagueRosterBundle'

describe('league roster bundle', () => {
  it('says later edits to saved rosters are not included', () => {
    const file = leagueRosterBundle({
      event: 'Autumn Open',
      capturedAt: new Date('2026-10-26T12:00:00Z'),
      rosters: [],
      dispositionName: (id) => id,
      version: '1.0.0',
    })
    expect(file.split('\n').slice(0, 3)).toContain(SEALED_COPIES_NOTICE)
  })
})
