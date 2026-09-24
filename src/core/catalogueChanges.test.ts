import { describe, expect, it } from 'vitest'
import {
  type CatalogueChangeSet,
  type ChangeSource,
  catalogueChanges,
  catalogueChangeSetSchema,
  changesTouching,
  isEmptyChangeSet,
  type ListContents,
} from './catalogueChanges'

type Sheet = ChangeSource['datasheets'][number]
type Detachment = ChangeSource['detachments'][number]

const row = (
  models: string,
  cost: string,
  condition: Partial<Pick<Sheet['costs'][number], 'keyword' | 'faction' | 'detachment'>> = {},
) => ({
  models,
  cost,
  keyword: null,
  faction: null,
  detachment: null,
  ...condition,
})

const sheet = (over: Partial<Sheet> = {}): Sheet => ({
  catalogueId: 'marines',
  faction: 'Space Marines',
  id: 'intercessors',
  name: 'Intercessor Squad',
  points: null,
  costs: [row('5', '80'), row('10', '150')],
  ...over,
})

const detachment = (over: Partial<Detachment> = {}): Detachment => ({
  catalogueId: 'marines',
  faction: 'Space Marines',
  id: 'gladius',
  name: 'Gladius Task Force',
  points: 2,
  enhancements: [{ name: 'Artificer Armour', points: 10 }],
  upgrades: [],
  ...over,
})

const source = (datasheets: Sheet[] = [], detachments: Detachment[] = []): ChangeSource => ({ datasheets, detachments })

const changesOf = (set: CatalogueChangeSet) => set.factions.flatMap((faction) => faction.changes)

describe('the change set between two snapshots', () => {
  it('is empty when nothing a player pays for changed', () => {
    expect(isEmptyChangeSet(catalogueChanges(source([sheet()], [detachment()]), source([sheet()], [detachment()])))).toBe(true)
  })

  it('reports a changed points row from its old price to its new one', () => {
    const changes = catalogueChanges(source([sheet()]), source([sheet({ costs: [row('5', '90'), row('10', '150')] })]))

    expect(changesOf(changes)).toEqual([
      {
        kind: 'datasheet-points',
        id: 'intercessors',
        name: 'Intercessor Squad',
        rows: [{ models: '5', condition: null, from: '80', to: '90' }],
      },
    ])
  })

  it('names no model count for a datasheet that prints one row', () => {
    const changes = catalogueChanges(source([sheet({ costs: [row('1', '80')] })]), source([sheet({ costs: [row('1', '95')] })]))

    expect(changesOf(changes)).toMatchObject([{ rows: [{ models: null, from: '80', to: '95' }] }])
  })

  it('compares the single price of a datasheet without a points table', () => {
    const changes = catalogueChanges(source([sheet({ costs: [], points: 60 })]), source([sheet({ costs: [], points: 65 })]))

    expect(changesOf(changes)).toMatchObject([{ kind: 'datasheet-points', rows: [{ models: null, from: '60', to: '65' }] }])
  })

  it('keeps a row printed under a condition apart from the plain row of the same size', () => {
    const before = sheet({ costs: [row('5', '80'), row('5', '70', { detachment: 'Gladius Task Force' })] })
    const after = sheet({ costs: [row('5', '80'), row('5', '75', { detachment: 'Gladius Task Force' })] })

    expect(changesOf(catalogueChanges(source([before]), source([after])))).toMatchObject([
      { rows: [{ models: '5', condition: 'Gladius Task Force', from: '70', to: '75' }] },
    ])
  })

  it('reports a row the source stops printing as leaving, not as a change to another row', () => {
    const changes = catalogueChanges(source([sheet()]), source([sheet({ costs: [row('5', '80')] })]))

    expect(changesOf(changes)).toMatchObject([{ rows: [{ models: '10', from: '150', to: null }] }])
  })

  it('does not pair two different prices printed for one row with anything', () => {
    const before = sheet({ costs: [row('1', '100'), row('1', '115')] })
    const after = sheet({ costs: [row('1', '100'), row('1', '120')] })

    expect(changesOf(catalogueChanges(source([before]), source([after])))).toMatchObject([
      {
        rows: [
          { from: '115', to: null },
          { from: null, to: '120' },
        ],
      },
    ])
  })

  it('treats an exact repeat of a row as the one row', () => {
    const repeated = sheet({ costs: [row('5', '80'), row('5', '80')] })

    expect(isEmptyChangeSet(catalogueChanges(source([repeated]), source([sheet({ costs: [row('5', '80')] })])))).toBe(true)
  })

  it('reports a renamed datasheet with the same id as the same datasheet', () => {
    const changes = catalogueChanges(
      source([sheet()]),
      source([sheet({ name: 'Intercessors', costs: [row('5', '85'), row('10', '150')] })]),
    )

    expect(changesOf(changes)).toMatchObject([{ kind: 'datasheet-points', id: 'intercessors', name: 'Intercessors' }])
  })

  it('reports a datasheet with a new id as removed and added rather than guessing it moved', () => {
    const changes = catalogueChanges(source([sheet()]), source([sheet({ id: 'intercessors-v2' })]))

    expect(changesOf(changes)).toEqual([
      { kind: 'datasheet-removed', id: 'intercessors', name: 'Intercessor Squad' },
      { kind: 'datasheet-added', id: 'intercessors-v2', name: 'Intercessor Squad' },
    ])
  })

  it('keeps the same datasheet in two factions apart', () => {
    const changes = catalogueChanges(
      source([sheet(), sheet({ catalogueId: 'angels', faction: 'Blood Angels' })]),
      source([sheet(), sheet({ catalogueId: 'angels', faction: 'Blood Angels', costs: [row('5', '85'), row('10', '150')] })]),
    )

    expect(changes.factions.map((faction) => faction.catalogueId)).toEqual(['angels'])
  })

  it('reports two different datasheets claiming one id as removed and added', () => {
    const changes = catalogueChanges(source([sheet()]), source([sheet(), sheet({ name: 'Heavy Intercessor Squad' })]))

    expect(changesOf(changes).map((change) => change.kind)).toEqual(['datasheet-removed', 'datasheet-added', 'datasheet-added'])
  })

  it('reports a detachment points change', () => {
    const changes = catalogueChanges(source([], [detachment()]), source([], [detachment({ points: 3 })]))

    expect(changesOf(changes)).toEqual([{ kind: 'detachment-points', id: 'gladius', name: 'Gladius Task Force', from: '2', to: '3' }])
  })

  it('reports a detachment the source stops pricing as a change to no stated price', () => {
    expect(changesOf(catalogueChanges(source([], [detachment()]), source([], [detachment({ points: null })])))).toMatchObject([
      { kind: 'detachment-points', from: '2', to: null },
    ])
  })

  it('reports detachments added and removed', () => {
    const changes = catalogueChanges(source([], [detachment()]), source([], [detachment({ id: 'anvil', name: 'Anvil Siege Force' })]))

    expect(changesOf(changes).map((change) => change.kind)).toEqual(['detachment-removed', 'detachment-added'])
  })

  it('reports an enhancement points change inside its detachment', () => {
    const changes = catalogueChanges(
      source([], [detachment()]),
      source([], [detachment({ enhancements: [{ name: 'Artificer Armour', points: 15 }] })]),
    )

    expect(changesOf(changes)).toEqual([
      {
        kind: 'enhancement-points',
        detachmentId: 'gladius',
        detachment: 'Gladius Task Force',
        name: 'Artificer Armour',
        upgrade: false,
        from: '10',
        to: '15',
      },
    ])
  })

  it('reports a renamed enhancement as removed and added', () => {
    const changes = catalogueChanges(
      source([], [detachment()]),
      source([], [detachment({ enhancements: [{ name: 'Artificer Armor', points: 10 }] })]),
    )

    expect(changesOf(changes)).toMatchObject([
      { kind: 'enhancement-removed', name: 'Artificer Armour' },
      { kind: 'enhancement-added', name: 'Artificer Armor' },
    ])
  })

  it('reports an enhancement leaving once however many prices it was printed with', () => {
    const twice = detachment({
      enhancements: [
        { name: 'Artificer Armour', points: 10 },
        { name: 'Artificer Armour', points: 15 },
      ],
    })

    expect(changesOf(catalogueChanges(source([], [twice]), source([], [detachment({ enhancements: [] })])))).toEqual([
      { kind: 'enhancement-removed', detachmentId: 'gladius', detachment: 'Gladius Task Force', name: 'Artificer Armour', upgrade: false },
    ])
  })

  it('keeps an upgrade apart from an enhancement of the same name', () => {
    const changes = catalogueChanges(
      source([], [detachment({ upgrades: [{ name: 'Artificer Armour', points: 5 }] })]),
      source([], [detachment({ upgrades: [{ name: 'Artificer Armour', points: 10 }] })]),
    )

    expect(changesOf(changes)).toMatchObject([{ kind: 'enhancement-points', upgrade: true, from: '5', to: '10' }])
  })

  it('orders factions by name and each faction by kind', () => {
    const changes = catalogueChanges(
      source([sheet(), sheet({ catalogueId: 'angels', faction: 'Blood Angels' })], [detachment()]),
      source([sheet({ costs: [row('5', '85'), row('10', '150')] })], [detachment({ points: 1 })]),
    )

    expect(changes.factions.map((faction) => [faction.faction, faction.changes.map((change) => change.kind)])).toEqual([
      ['Blood Angels', ['datasheet-removed']],
      ['Space Marines', ['datasheet-points', 'detachment-points']],
    ])
  })

  it('gives the same output for inputs in any order', () => {
    const before = source([sheet(), sheet({ id: 'captain', name: 'Captain', costs: [row('1', '80')] })])
    const after = source([sheet({ id: 'captain', name: 'Captain', costs: [row('1', '90')] }), sheet({ costs: [row('5', '85')] })])

    expect(JSON.stringify(catalogueChanges(before, after))).toBe(
      JSON.stringify(catalogueChanges(source(before.datasheets.toReversed()), source(after.datasheets.toReversed()))),
    )
  })

  it('stops at its bound and counts what it left out', () => {
    const many = (price: string) =>
      Array.from({ length: 5 }, (_, at) => sheet({ id: `unit-${at}`, name: `Unit ${at}`, costs: [row('1', price)] }))

    const changes = catalogueChanges(source(many('10')), source(many('20')), 3)

    expect({ kept: changesOf(changes).length, omitted: changes.omitted }).toEqual({ kept: 3, omitted: 2 })
  })

  it('reads back through its schema unchanged', () => {
    const changes = catalogueChanges(
      source([sheet()], [detachment()]),
      source([sheet({ points: 5, costs: [] })], [detachment({ points: 4 })]),
    )

    expect(catalogueChangeSetSchema.parse(JSON.parse(JSON.stringify(changes)))).toEqual(changes)
  })
})

describe('the changes that reach a saved list', () => {
  const list = (over: Partial<ListContents> = {}): ListContents => ({
    catalogueId: 'marines',
    detachmentIds: ['gladius'],
    datasheetIds: ['intercessors'],
    enhancements: ['Artificer Armour'],
    upgrades: [],
    ...over,
  })
  const recorded = (recordedAt: number, before: ChangeSource, after: ChangeSource) => ({
    recordedAt,
    changes: catalogueChanges(before, after),
  })
  const repriced = recorded(
    200,
    source([sheet()], [detachment()]),
    source(
      [sheet({ costs: [row('5', '90'), row('10', '150')] })],
      [detachment({ points: 3, enhancements: [{ name: 'Artificer Armour', points: 20 }] })],
    ),
  )
  const kinds = (changes: ReturnType<typeof changesTouching>) => changes.map((entry) => entry.change.kind)

  it('names the datasheet, detachment and enhancement changes the list holds', () => {
    expect(kinds(changesTouching(list(), 100, [repriced]))).toEqual(['datasheet-points', 'detachment-points', 'enhancement-points'])
  })

  it('ignores changes recorded before the list was last saved', () => {
    expect(changesTouching(list(), 200, [repriced])).toEqual([])
  })

  it('ignores a datasheet the list does not field', () => {
    expect(kinds(changesTouching(list({ datasheetIds: ['captain'] }), 100, [repriced]))).not.toContain('datasheet-points')
  })

  it('ignores an enhancement the list does not hold', () => {
    expect(kinds(changesTouching(list({ enhancements: ['The Honour Vehement'] }), 100, [repriced]))).not.toContain('enhancement-points')
  })

  it('ignores a detachment of the same id in another book', () => {
    expect(kinds(changesTouching(list({ catalogueId: 'angels' }), 100, [repriced]))).toEqual(['datasheet-points'])
  })

  it('matches an enhancement name the way pricing joins it', () => {
    expect(kinds(changesTouching(list({ enhancements: ['Artificer armour'] }), 100, [repriced]))).toContain('enhancement-points')
  })

  it('reaches a list whose datasheet was removed', () => {
    const removed = recorded(300, source([sheet()]), source([]))

    expect(kinds(changesTouching(list(), 100, [removed]))).toEqual(['datasheet-removed'])
  })

  it('never reaches a list through an addition', () => {
    const added = recorded(300, source([], [detachment({ enhancements: [] })]), source([sheet()], [detachment()]))

    expect(changesTouching(list(), 100, [added])).toEqual([])
  })

  const gladiusAt = (recordedAt: number, from: number, to: number) =>
    recorded(recordedAt, source([], [detachment({ points: from })]), source([], [detachment({ points: to })]))

  it('names an item two updates changed once, from its first value to its last', () => {
    expect(changesTouching(list(), 100, [gladiusAt(300, 3, 4), gladiusAt(200, 2, 3)]).map((entry) => entry.change)).toEqual([
      { kind: 'detachment-points', id: 'gladius', name: 'Gladius Task Force', from: '2', to: '4' },
    ])
  })

  it('names nothing for an item that ends where it started', () => {
    expect(changesTouching(list(), 100, [gladiusAt(200, 2, 3), gladiusAt(300, 3, 2)])).toEqual([])
  })

  it('names nothing for a datasheet removed and then brought back', () => {
    const removed = recorded(200, source([sheet()]), source([]))
    const restored = recorded(300, source([]), source([sheet()]))

    expect(changesTouching(list(), 100, [removed, restored])).toEqual([])
  })

  it('names nothing for a datasheet added and then removed again', () => {
    const added = recorded(200, source([]), source([sheet()]))
    const removed = recorded(300, source([sheet()]), source([]))

    expect(changesTouching(list(), 100, [added, removed])).toEqual([])
  })

  it('folds each points row of a datasheet on its own', () => {
    const later = recorded(
      300,
      source([sheet({ costs: [row('5', '90'), row('10', '150')] })]),
      source([sheet({ costs: [row('5', '80'), row('10', '160')] })]),
    )

    expect(changesTouching(list(), 100, [repriced, later]).find((entry) => entry.change.kind === 'datasheet-points')?.change).toMatchObject(
      {
        rows: [{ models: '10', from: '150', to: '160' }],
      },
    )
  })
})
