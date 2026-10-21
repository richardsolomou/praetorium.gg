import { describe, expect, it } from 'vitest'
import { showsRulesText } from './TextSourcesNotice'

describe('showsRulesText', () => {
  it.each([
    '/factions/space-marines',
    '/rules/core/1',
    '/missions',
    '/missions/pack/secondaries/card',
    '/mission-matchups/pack/a/b',
    '/rosters',
    '/rosters/abc/edit',
    '/battles/token',
    '/simulator',
  ])('asks on %s', (path) => {
    expect(showsRulesText(path)).toBe(true)
  })

  it.each(['/', '/factions', '/rules', '/battles', '/sources', '/leagues/token', '/profile', '/rostersx', '/simulatorx'])(
    'stays quiet on %s',
    (path) => {
      expect(showsRulesText(path)).toBe(false)
    },
  )
})
