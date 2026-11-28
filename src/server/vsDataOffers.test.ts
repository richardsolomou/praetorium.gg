import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from '../core/catalogue'
import { unitsIn } from '../shared/cataloguePicker'
import { detachmentsOf } from '../shared/catalogueIndex'
import { vsDataErrors, vsRosterData } from '../shared/vsDataLegality'
import { offeredDetachments, vsDataRefusedUnits } from '../shared/vsDataOffers'
import { points, shelfOf, system } from './catalogue.fixtures'

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const unitIn = (faction: string) => ({ faction, keywords: ['INFANTRY'], sizes: [1] })
const vsRoster = vsRosterData(
  {
    release: 'test',
    rulesVersion: { edition: '11th', update: 'test' },
    unavailable: [],
    points: [],
    definitions: {
      faction: {
        host: record('Host', { excludedUnits: ['host.banned'], allies: [{ units: ['other.friend'] }] }),
        other: record('Other', {}),
        engines: record('Engines', { withoutDetachments: { warlords: [], dispositions: [] } }),
      },
      detachment: {
        'host.guard': record('Guard', { faction: 'host', dispositions: ['pack.take-and-hold'], excludedUnits: ['host.mob'] }),
        'other.raid': record('Raid', { faction: 'other' }),
      },
      unit: {
        'host.mob': record('Mob', unitIn('host')),
        'host.banned': record('Banned', unitIn('host')),
        'other.friend': record('Friend', unitIn('other')),
        'other.stranger': record('Stranger', unitIn('other')),
        'other.relic': record('Relic', { ...unitIn('other'), legends: true }),
      },
    },
  },
  {
    books: { cat: 'host', 'cat-1': 'engines' },
    detachments: { guard: 'host.guard', raid: 'other.raid', lost: 'host.lost' },
    units: { mob: 'host.mob', banned: 'host.banned', friend: 'other.friend', stranger: 'other.stranger', relic: 'other.relic' },
    enhancements: {},
  },
  null,
  (id) => ({ mob: 'Mob', banned: 'Banned', friend: 'Friend', stranger: 'Stranger', relic: 'Relic [Legends]' })[id],
)
const datasheet = (id: string, name: string) => ({ id, name, type: 'unit' as const, costs: points(10) })
const book: Partial<Catalogue> = {
  selectionEntries: [
    datasheet('mob', 'Mob'),
    datasheet('banned', 'Banned'),
    datasheet('friend', 'Friend'),
    datasheet('stranger', 'Stranger'),
    datasheet('relic', 'Relic [Legends]'),
  ],
  sharedSelectionEntries: [
    {
      id: 'wrapper',
      name: 'Detachment',
      type: 'upgrade',
      selectionEntryGroups: [
        {
          id: 'choices',
          name: 'Detachment',
          selectionEntries: [
            { id: 'guard', name: 'Guard', type: 'upgrade' },
            { id: 'raid', name: 'Raid', type: 'upgrade' },
            { id: 'lost', name: 'Lost', type: 'upgrade' },
          ],
        },
      ],
    },
  ],
}
// A Titan book none of whose datasheets VS Data reads as its own, as Titanicus Traitoris's, holding another army's Detachment.
const titans: Partial<Catalogue> = {
  sharedSelectionEntries: [
    {
      id: 'titan-wrapper',
      name: 'Detachment',
      type: 'upgrade',
      selectionEntryGroups: [
        { id: 'titan-choices', name: 'Detachment', selectionEntries: [{ id: 'tide', name: 'Tide', type: 'upgrade' }] },
      ],
    },
  ],
}
const loaded = { ...shelfOf(book, titans), vsRoster }
const offered = unitsIn(loaded, 'cat', '')

describe('the units a book offers under VS Data', () => {
  it('leaves out another faction’s datasheet that no ally entry offers', () => {
    expect(offered.map((unit) => unit.name)).not.toContain('Stranger')
  })

  it('leaves out a datasheet the faction excludes', () => {
    expect(offered.map((unit) => unit.name)).not.toContain('Banned')
  })

  it('leaves out a Legends datasheet of a faction an ally entry offers but leaves it out of', () => {
    expect(unitsIn(loaded, 'cat', '', { nonMatchedPlay: true }).map((unit) => unit.name)).not.toContain('Relic [Legends]')
  })

  it('refuses a held Legends datasheet of a faction an ally entry offers but leaves it out of', () => {
    expect(
      vsDataErrors(vsRoster, { catalogueId: 'cat', detachmentIds: ['guard'], limit: 1000 }, [
        { key: 0, entryId: 'relic', name: 'Relic [Legends]', size: { models: 1, min: 1, max: 1 }, toggles: [], choices: [] },
      ]),
    ).toContainEqual({ entryId: 'relic', entryName: 'Relic [Legends]', message: 'cannot be taken by this army' })
  })

  it('offers an ally entry’s datasheet as allied', () => {
    expect(offered.find((unit) => unit.name === 'Friend')?.allied).toBe(true)
  })
})

describe('the Detachments a book offers under VS Data', () => {
  it('leaves out another faction’s Detachment', () => {
    expect(offeredDetachments(loaded, 'cat').map((option) => option.name)).not.toContain('Raid')
  })

  it('offers a Titan army no Detachment even where VS Data cannot place its book', () => {
    expect(offeredDetachments(loaded, 'cat-1')).toEqual([])
  })

  it('offers a Detachment VS Data has no record of, as the catalogue does', () => {
    expect(offeredDetachments(loaded, 'cat').map((option) => option.name)).toContain('Lost')
  })

  it('gives a Detachment the force disposition VS Data gives it', () => {
    const file: CatalogueFile = { catalogue: { id: 'cat', name: 'Test catalogue', ...book } }
    const index = buildIndex([system, file], 'test-revision')
    expect(
      detachmentsOf([system, file], index, vsRoster)
        .get('cat')
        ?.options.find((option) => option.id === 'guard')?.disposition,
    ).toBe('take-and-hold')
  })
})

describe('the units a list with a Detachment may take under VS Data', () => {
  it('leaves out a datasheet the Detachment excludes', () => {
    expect(unitsIn(loaded, 'cat', '', { detachmentIds: ['guard'] }).map((unit) => unit.name)).not.toContain('Mob')
  })

  it('refuses a held datasheet the Detachment excludes', () => {
    expect(vsDataRefusedUnits(loaded, { catalogueId: 'cat', detachmentIds: ['guard'] }, [{ entryId: 'mob', name: 'Mob' }])).toEqual([
      { entryId: 'mob', entryName: 'Mob', message: 'cannot be taken by this army' },
    ])
  })
})
