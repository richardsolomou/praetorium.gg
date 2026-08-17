import { describe, expect, it } from 'vitest'
import { shortName } from './factions'

describe('faction names', () => {
  it('removes catalogue lineage and implementation suffixes', () => {
    expect(shortName('Imperium - Imperial Knights - Library')).toBe('Imperial Knights')
  })

  it('uses the familiar Imperial name for an Imperium agent faction', () => {
    expect(shortName('Imperium - Agents of the Imperium')).toBe('Imperial Agents')
  })
})
