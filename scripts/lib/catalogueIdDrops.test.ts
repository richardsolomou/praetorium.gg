import { expect, it } from 'vitest'
import { failsCheck, idDrops, type SavedIds } from './catalogueIdDrops'

const BOOK = 'book'
const saved = ({
  datasheets = {},
  detachments = {},
  options = {},
  enhancements = [],
}: {
  datasheets?: Record<string, string>
  detachments?: Record<string, string>
  options?: Record<string, Record<string, string>>
  enhancements?: string[]
}): SavedIds => ({
  factions: new Map([[BOOK, 'Book']]),
  datasheets: new Map([[BOOK, new Map(Object.entries(datasheets))]]),
  detachments: new Map([[BOOK, new Map(Object.entries(detachments))]]),
  enhancements: new Set(enhancements),
  options: (entryId) => new Map(Object.entries(options[entryId] ?? {})),
})
const removedDatasheet = (name: string) => ({
  recordedAt: 1,
  changes: {
    factions: [{ catalogueId: BOOK, faction: 'Book', changes: [{ kind: 'datasheet-removed' as const, id: 'old', name }] }],
    omitted: 0,
  },
})
const verdicts = (before: SavedIds, after: SavedIds, options: Partial<Parameters<typeof idDrops>[2]> = {}) =>
  idDrops(before, after, { history: [], migrated: new Set(), accepted: new Map(), ...options }).map(
    (drop) => `${failsCheck(drop) ? 'fails' : 'passes'} ${drop.verdict} ${drop.kind} ${drop.name}${drop.to ? ` -> ${drop.to.name}` : ''}`,
  )

it('fails a datasheet that keeps its name under a new id, even though the history records its name as removed', () => {
  expect(
    verdicts(saved({ datasheets: { a: 'Intercessor Squad' } }), saved({ datasheets: { b: 'Intercessor Squad' } }), {
      history: [removedDatasheet('Intercessor Squad')],
    }),
  ).toEqual(['fails reissued datasheet Intercessor Squad -> Intercessor Squad'])
})

it('reads a dropped article as a rename but a detachment sharing two words as a removal', () => {
  expect(
    verdicts(
      saved({ detachments: { a: "The Imperium's Sword", b: 'Anvil Siege Force' } }),
      saved({ detachments: { c: "Imperium's Sword", d: 'Gravis Siege Force' } }),
    ),
  ).toEqual(["fails renamed detachment The Imperium's Sword -> Imperium's Sword", 'fails unrecorded detachment Anvil Siege Force'])
})

it('passes a removal the data-update history records', () => {
  expect(verdicts(saved({ datasheets: { a: 'Legends Squad' } }), saved({}), { history: [removedDatasheet('Legends Squad')] })).toEqual([
    'passes removed datasheet Legends Squad',
  ])
})

it('fails a datasheet option reissued under a new id, and passes one that left the datasheet', () => {
  expect(
    verdicts(
      saved({ datasheets: { s: 'Squad' }, options: { s: { a: 'Power fist', b: 'Grav-gun' } } }),
      saved({ datasheets: { s: 'Squad' }, options: { s: { c: 'Power Fist' } } }),
    ),
  ).toEqual(['fails reissued option Power fist -> Power Fist', 'passes removed option Grav-gun'])
})

it('fails an enhancement that left a datasheet when the history does not record its removal', () => {
  expect(
    verdicts(
      saved({ datasheets: { s: 'Captain' }, options: { s: { a: 'Iron Resolve' } }, enhancements: ['iron resolve'] }),
      saved({ datasheets: { s: 'Captain' } }),
    ),
  ).toEqual(['fails unrecorded enhancement Iron Resolve'])
})

it('reads a rename at exactly two thirds of its words', () => {
  expect(verdicts(saved({ detachments: { a: 'Anvil Siege Force' } }), saved({ detachments: { b: 'Siege Force' } }))).toEqual([
    'fails renamed detachment Anvil Siege Force -> Siege Force',
  ])
})

it('fails a mapped id whose target the new catalogue lacks', () => {
  const retired = 'profile-unit-4eef-e313-1eea-94a6-d358-df4a-1c2f-4bff'
  expect(verdicts(saved({ datasheets: { [retired]: 'Adrax Agatone' } }), saved({}), { migrated: new Set([retired]) })).toEqual([
    'fails unresolved datasheet Adrax Agatone -> ',
  ])
})

it('passes a mapped id and an accepted one', () => {
  expect(
    verdicts(saved({ datasheets: { a: 'Squad', b: 'Squad' } }), saved({ datasheets: { c: 'Squad' } }), {
      migrated: new Set(['a']),
      accepted: new Map([[JSON.stringify(['datasheet', 'b']), 'merged upstream']]),
    }),
  ).toEqual(['passes reissued datasheet Squad -> Squad'])
})
