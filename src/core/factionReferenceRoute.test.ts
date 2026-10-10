import { expect, it } from 'vitest'
import { factionReferenceHref, referenceFactionId } from './factionReferenceRoute'

const base = { id: 'book', displayName: 'Adeptus Custodes', isDefault: true }
const preview = { ...base, id: 'custodes-11e~book', edition: { id: 'custodes-11e' }, isDefault: false }

it('gives each selected rules version a readable faction path', () => {
  expect([factionReferenceHref(base), factionReferenceHref(preview)]).toEqual([
    '/factions/adeptus-custodes',
    '/factions/adeptus-custodes/rules/custodes-11e',
  ])
})

it('keeps the rules version in nested datasheet paths', () => {
  expect(factionReferenceHref(preview, '/datasheets/allarus-custodians')).toBe(
    '/factions/adeptus-custodes/rules/custodes-11e/datasheets/allarus-custodians',
  )
})

it('preserves the original rules after another version becomes the default', () => {
  expect(factionReferenceHref({ ...base, isDefault: false })).toBe('/factions/adeptus-custodes/rules/book')
})

it('resolves a readable versioned route to the exact catalogue identity', () => {
  expect(referenceFactionId([base, preview], 'adeptus-custodes', 'custodes-11e')).toBe(preview.id)
})

it('keeps an explicit original version separate from a promoted default', () => {
  expect(referenceFactionId([{ ...base, isDefault: false }, preview], 'adeptus-custodes', 'book')).toBe(base.id)
})

it('does not select another faction for an unknown path', () => {
  expect(referenceFactionId([base, preview], 'necrons', 'custodes-11e')).toBeNull()
})
