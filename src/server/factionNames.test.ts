import { describe, expect, it } from 'vitest'
import { factionDisplayName } from './factionNames'

describe('faction display names', () => {
  const names = new Map([
    ['agents-of-the-imperium', 'Imperial Agents'],
    ['imperial-knights', 'Imperial Knights'],
  ])

  it('uses the rules source name for a catalogue faction', () => {
    expect(factionDisplayName('Imperium - Agents of the Imperium', names)).toBe('Imperial Agents')
  })

  it('resolves a library through its owning faction name', () => {
    expect(factionDisplayName('Imperium - Imperial Knights - Library', names)).toBe('Imperial Knights')
  })
})
