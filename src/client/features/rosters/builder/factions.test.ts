import { describe, expect, it } from 'vitest'
import { shortName } from './factions'

describe('faction names', () => {
  it('removes catalogue lineage and implementation suffixes', () => {
    expect(shortName('Imperium - Imperial Knights - Library')).toBe('Imperial Knights')
  })
})
