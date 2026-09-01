import { describe, expect, it } from 'vitest'
import { normalizedName, normalizedNameVariants } from './name'

describe('normalized name', () => {
  it('folds case, non-breaking spaces and repeated whitespace', () => {
    expect(normalizedName('  Storm\u00a0  Guardians ')).toBe('storm guardians')
  })

  it.each([
    ['Storm Guardians', ['storm guardians', 'storm guardian']],
    ['Weapon Battery', ['weapon battery', 'weapon batteries']],
    ['Weapon Batteries', ['weapon batteries', 'weapon battery']],
  ])('offers the trailing plural variant of %s', (name, variants) => {
    expect(normalizedNameVariants(name)).toEqual(variants)
  })
})
