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

it('resolves an archived faction whose current catalogue has a different identity', () => {
  expect(
    referenceFactionId(
      [
        { id: 'current', displayName: 'Ultramarines', isDefault: true },
        { id: 'legacy-profiles~previous', displayName: 'Ultramarines', edition: { id: 'legacy-profiles' } },
      ],
      'ultramarines',
      'legacy-profiles',
    ),
  ).toBe('legacy-profiles~previous')
})

it('resolves old exact links and support books when a named base hides its duplicate', () => {
  const named = { ...base, id: 'current~book', edition: { id: 'current' } }
  expect([referenceFactionId([named], 'adeptus-custodes', 'book'), referenceFactionId([named], 'adeptus-custodes', 'archived')]).toEqual([
    'book',
    'archived~book',
  ])
})

it('uses the published rules slug without changing saved catalogue identities', () => {
  const named = { ...preview, edition: { id: 'custodes-11e', slug: 'custodes-codex-2026-10-17' } }
  expect(factionReferenceHref(named)).toBe('/factions/adeptus-custodes/rules/custodes-codex-2026-10-17')
})

it('resolves dated rules slugs to their original saved catalogue identities', () => {
  const named = { ...preview, edition: { id: 'custodes-11e', slug: 'custodes-codex-2026-10-17' } }
  expect(referenceFactionId([base, named], 'adeptus-custodes', 'custodes-codex-2026-10-17')).toBe(preview.id)
})

it('retains old edition links after a readable rules slug is published', () => {
  const named = { ...preview, edition: { id: 'custodes-11e', slug: 'custodes-codex-2026-10-17' } }
  expect(referenceFactionId([base, named], 'adeptus-custodes', 'custodes-11e')).toBe(preview.id)
})

it('resolves dated edition slugs for imported support books', () => {
  const named = { ...preview, edition: { id: 'custodes-11e', slug: 'custodes-codex-2026-10-17' } }
  expect(referenceFactionId([{ ...base, displayName: 'Space Marines' }, named], 'space-marines', 'custodes-codex-2026-10-17')).toBe(
    'custodes-11e~book',
  )
})

it('gives root MFM rules a readable version path', () => {
  expect(factionReferenceHref({ ...base, rulesSlug: 'mfm-1-5' })).toBe('/factions/adeptus-custodes/rules/mfm-1-5')
})

it('resolves root MFM paths without treating their slug as an edition ID', () => {
  expect(referenceFactionId([{ ...base, rulesSlug: 'mfm-1-5' }], 'adeptus-custodes', 'mfm-1-5')).toBe(base.id)
})

it('opens the current rules from a superseded root MFM path', () => {
  expect(referenceFactionId([{ ...base, rulesSlug: 'mfm-1-6' }, preview], 'adeptus-custodes', 'mfm-1-5')).toBe(base.id)
})

it('opens the archived rules version named for a superseded root MFM path', () => {
  const archived = { ...preview, id: 'mfm15~book', edition: { id: 'mfm15', slug: 'mfm-1-5-2026-10-13', name: 'MFM 1.5' } }
  expect(referenceFactionId([{ ...base, rulesSlug: 'mfm-1-6' }, archived], 'adeptus-custodes', 'mfm-1-5')).toBe(archived.id)
})

it('finds no rules for a superseded root MFM path of another faction', () => {
  expect(referenceFactionId([{ ...base, rulesSlug: 'mfm-1-6' }], 'necrons', 'mfm-1-5')).toBeNull()
})
