import { expect, it } from 'vitest'
import type { CatalogueChangeSet } from '../core/catalogueChanges'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import { linkedChanges } from './catalogueChangeLog'

const canonical = {
  datasheets: [{ catalogueId: 'marines', id: 'intercessors', referenceRoute: { catalogueId: 'space-marines', slug: 'intercessor-squad' } }],
  detachments: [{ catalogueId: 'marines', id: 'gladius', factionSlug: 'space-marines', slug: 'gladius-task-force' }],
} as unknown as CanonicalCatalogue

const set = (changes: CatalogueChangeSet['factions'][number]['changes']): CatalogueChangeSet => ({
  factions: [{ catalogueId: 'marines', faction: 'Space Marines', changes }],
  omitted: 0,
})

const links = (changes: CatalogueChangeSet['factions'][number]['changes'], data: CanonicalCatalogue | null = canonical) =>
  linkedChanges(set(changes), data).factions[0]!.changes.map((change) => change.link)

it('links a repriced datasheet to its reference page', () => {
  expect(links([{ kind: 'datasheet-points', id: 'intercessors', name: 'Intercessor Squad', rows: [] }])).toEqual([
    { kind: 'datasheet', faction: 'space-marines', slug: 'intercessor-squad' },
  ])
})

it('links an enhancement to the detachment that offers it', () => {
  expect(
    links([
      {
        kind: 'enhancement-points',
        detachmentId: 'gladius',
        detachment: 'Gladius Task Force',
        name: 'Artificer Armour',
        upgrade: false,
        from: '10',
        to: '15',
      },
    ]),
  ).toEqual([{ kind: 'detachment', faction: 'space-marines', slug: 'gladius-task-force' }])
})

it('links a removed datasheet nowhere, even while an entry with its id remains', () => {
  expect(links([{ kind: 'datasheet-removed', id: 'intercessors', name: 'Intercessor Squad' }])).toEqual([null])
})

it('links nothing the current data no longer holds', () => {
  expect(links([{ kind: 'detachment-points', id: 'anvil', name: 'Anvil Siege Force', from: '1', to: '2' }])).toEqual([null])
})

it('links nothing while the instance holds no data', () => {
  expect(links([{ kind: 'datasheet-points', id: 'intercessors', name: 'Intercessor Squad', rows: [] }], null)).toEqual([null])
})
