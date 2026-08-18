import { describe, expect, it } from 'vitest'
import { preservesUnitSequence } from './pricePlaceholder'

describe('preservesUnitSequence', () => {
  const unit = { entryId: 'captain', catalogueId: 'space-marines' }

  it('preserves pricing while a unit choice changes', () => {
    expect(preservesUnitSequence([{ ...unit, choices: { enhancement: 'relic' } }], [{ ...unit, choices: { enhancement: 'blade' } }])).toBe(
      true,
    )
  })

  it('preserves pricing while a unit is appended', () => {
    expect(preservesUnitSequence([unit], [unit, { entryId: 'intercessors', catalogueId: 'space-marines' }])).toBe(true)
  })

  it('discards pricing when a unit is removed', () => {
    expect(preservesUnitSequence([unit, { entryId: 'intercessors', catalogueId: 'space-marines' }], [unit])).toBe(false)
  })
})
