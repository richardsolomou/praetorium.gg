import { describe, expect, it } from 'vitest'
import type { CatalogueChangeSet } from '../core/catalogueChanges'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import type { CatalogueHistoryEntry } from '../core/catalogueHistory'
import {
  factionHistory,
  factionsLastUpdated,
  indexedUpdate,
  listedHistory,
  referenceHistory,
  referencesLastUpdated,
} from './catalogueChangeLog'

const canonical = {
  datasheets: [
    { catalogueId: 'marines', id: 'intercessors', referenceRoute: { catalogueId: 'space-marines', slug: 'intercessor-squad' } },
    { catalogueId: 'orks', id: 'boyz', referenceRoute: { catalogueId: 'orks', slug: 'boyz' } },
  ],
  detachments: [{ catalogueId: 'marines', id: 'gladius', factionSlug: 'space-marines', slug: 'gladius-task-force' }],
} as unknown as CanonicalCatalogue

type Changes = CatalogueChangeSet['factions'][number]['changes']

const set = (changes: Changes): CatalogueChangeSet => ({
  factions: [{ catalogueId: 'marines', faction: 'Space Marines', changes }],
  omitted: 0,
})

const historyOf = (factions: CatalogueChangeSet['factions']): CatalogueHistoryEntry => ({
  from: 'from',
  revisions: {},
  recordedAt: 1,
  changes: { factions, omitted: 0 },
})

const links = (changes: Changes, data: CanonicalCatalogue | null = canonical) =>
  indexedUpdate(historyOf(set(changes).factions), data).groups[0]!.changes.map((change) => change.link)

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

it('links a change several armies share through the first army that has the page', () => {
  const change: Changes[number] = { kind: 'datasheet-points', id: 'intercessors', name: 'Intercessor Squad', rows: [] }
  const shared = indexedUpdate(
    historyOf([
      { catalogueId: 'chapter', faction: 'A Chapter', changes: [change] },
      { catalogueId: 'marines', faction: 'Space Marines', changes: [change] },
    ]),
    canonical,
  )

  expect(shared.groups[0]!.changes[0]!.link).toEqual({ kind: 'datasheet', faction: 'space-marines', slug: 'intercessor-squad' })
})

it('links nothing while the instance holds no data', () => {
  expect(links([{ kind: 'datasheet-points', id: 'intercessors', name: 'Intercessor Squad', rows: [] }], null)).toEqual([null])
})

const repriced: CatalogueChangeSet['factions'][number]['changes'][number] = { kind: 'datasheet-points', id: 'boyz', name: 'Boyz', rows: [] }

const entry = (recordedAt: number, factions: string[], omitted = 0): CatalogueHistoryEntry => ({
  from: `from-${recordedAt}`,
  revisions: {},
  recordedAt,
  changes: { factions: factions.map((catalogueId) => ({ catalogueId, faction: catalogueId, changes: [repriced] })), omitted },
})

describe("a faction's data updates", () => {
  it('keep only the updates that reached the faction', () => {
    expect(factionHistory([entry(1, ['marines']), entry(2, ['orks'])], canonical, 'orks').map((update) => update.recordedAt)).toEqual([2])
  })

  it("keep only the faction's own changes from an update", () => {
    expect(
      factionHistory([entry(1, ['marines', 'orks'])], canonical, 'orks')[0]!.changes.factions.map((faction) => faction.catalogueId),
    ).toEqual(['orks'])
  })

  it('count the unlisted changes on the faction an update was cut after', () => {
    expect(factionHistory([entry(1, ['marines', 'orks'], 5)], canonical, 'orks')[0]!.changes.omitted).toBe(5)
  })

  it('count no unlisted changes on a faction listed before the cut', () => {
    expect(factionHistory([entry(1, ['marines', 'orks'], 5)], canonical, 'space-marines')[0]!.changes.omitted).toBe(0)
  })

  it('date each faction by its newest update', () => {
    expect(factionsLastUpdated([entry(1, ['orks', 'marines']), entry(3, ['orks']), entry(2, ['marines'])], canonical)).toEqual(
      new Map([
        ['orks', 3],
        ['space-marines', 2],
      ]),
    )
  })

  it('date no faction the current data cannot address', () => {
    expect(factionsLastUpdated([entry(1, ['squats'])], canonical).size).toBe(0)
  })
})

describe('listed data updates', () => {
  it("leave out a rules version's copy of its army's changes", () => {
    expect(listedHistory([entry(1, ['orks', 'mfm-1-6~orks'])])[0]!.changes.factions.map((faction) => faction.catalogueId)).toEqual(['orks'])
  })

  it('keep the changes a rules version made apart from its army', () => {
    const update = entry(1, ['orks', 'mfm-1-5~orks'])
    update.changes.factions[1]!.changes = [{ ...repriced, name: 'Boyz (MFM 1.5)' }]
    expect(listedHistory([update])[0]!.changes.factions.map((faction) => faction.catalogueId)).toEqual(['orks', 'mfm-1-5~orks'])
  })

  const introduced = (recordedAt: number, catalogueId: string): CatalogueHistoryEntry => ({
    ...entry(recordedAt, []),
    changes: {
      factions: [{ catalogueId, faction: catalogueId, changes: [{ kind: 'datasheet-added', id: 'boyz', name: 'Boyz' }] }],
      omitted: 0,
    },
  })

  it('leave out an update that only introduced a rules version', () => {
    expect(listedHistory([introduced(1, 'mfm-1-6~orks')])).toEqual([])
  })

  it('keep datasheets added to a rules version after it was introduced', () => {
    expect(listedHistory([introduced(1, 'mfm-1-6~orks'), introduced(2, 'mfm-1-6~orks')]).map((update) => update.recordedAt)).toEqual([2])
  })

  it('keep the first datasheets added to an army', () => {
    expect(listedHistory([introduced(1, 'orks')])).toHaveLength(1)
  })
})

const recorded = (recordedAt: number, changes: CatalogueChangeSet['factions'][number]['changes']): CatalogueHistoryEntry => ({
  from: `from-${recordedAt}`,
  revisions: {},
  recordedAt,
  changes: set(changes),
})

const intercessors = (from: string, to: string): CatalogueChangeSet['factions'][number]['changes'][number] => ({
  kind: 'datasheet-points',
  id: 'intercessors',
  name: 'Intercessor Squad',
  rows: [{ models: '5', condition: null, from, to }],
})

describe("a reference page's own changes", () => {
  it('list the changes to that page, newest first', () => {
    expect(
      referenceHistory(
        [recorded(1, [intercessors('80', '85')]), recorded(2, [intercessors('85', '90')])],
        canonical,
        '/factions/space-marines/datasheets/intercessor-squad',
      ).map((change) => change.recordedAt),
    ).toEqual([2, 1])
  })

  it('leave out changes to other pages', () => {
    expect(referenceHistory([recorded(1, [repriced])], canonical, '/factions/space-marines/datasheets/intercessor-squad')).toEqual([])
  })

  it('include enhancement changes on their detachment', () => {
    const enhancement = {
      kind: 'enhancement-added',
      detachmentId: 'gladius',
      detachment: 'Gladius Task Force',
      name: 'Artificer Armour',
      upgrade: false,
    } as const
    expect(referenceHistory([recorded(1, [enhancement])], canonical, '/factions/space-marines/detachments/gladius-task-force')).toEqual([
      { recordedAt: 1, change: enhancement },
    ])
  })
})

describe('reference page dates', () => {
  it('date each page by the newest change to it', () => {
    expect(referencesLastUpdated([recorded(3, [intercessors('80', '85')]), recorded(2, [intercessors('85', '90')])], canonical)).toEqual(
      new Map([['/factions/space-marines/datasheets/intercessor-squad', 3]]),
    )
  })

  it('date no page for a change the current data cannot address', () => {
    expect(
      referencesLastUpdated([recorded(1, [{ kind: 'datasheet-removed', id: 'intercessors', name: 'Intercessor Squad' }])], canonical).size,
    ).toBe(0)
  })
})
