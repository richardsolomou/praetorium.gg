import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile, type Modifier } from '../core/catalogue'
import { datasheetIn, datasheetInBySlug, rulesReferencedIn } from './catalogue'
import { detachmentCatalogueDetail } from './catalogueDescriptions'
import { detachmentsOf, factionsIn, type LoadedCatalogue } from './catalogueIndex'
import { unitsIn } from './cataloguePicker'

const PTS = 'cost-pts'

const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const points = (value: number) => [{ name: 'pts', typeId: PTS, value }]

/** A shelf of books, as the picker sees them. The first is the one being picked from. */
function shelfOf(...catalogues: Partial<Catalogue>[]): LoadedCatalogue {
  const files = catalogues.map(
    (catalogue, at): CatalogueFile => ({
      catalogue: { id: at ? `cat-${at}` : 'cat', name: at ? `Book ${at}` : 'Test catalogue', ...catalogue },
    }),
  )
  const index = buildIndex([system, ...files], 'test-revision')
  return { index, factions: factionsIn(index, detachmentsOf(files, index)), detachments: detachmentsOf(files, index) }
}

/** A book of datasheets, as the picker sees one. */
const bookOf = (catalogue: Partial<Catalogue>) => shelfOf(catalogue)

const offered = (loaded: LoadedCatalogue) => unitsIn(loaded, 'cat', '').map((unit) => unit.name)

const categories = (...names: string[]) => names.map((name, at) => ({ id: `link-${at}`, targetId: `cat-${at}`, name }))

const ability = (id: string, name: string) => ({
  id,
  name,
  typeName: 'Abilities',
  characteristics: [{ name: 'Description', $text: `${name} text` }],
})

type ProfileOperationCase = Pick<Modifier, 'type' | 'value' | 'position' | 'join' | 'arg'> & {
  base: string
  expected: string
  repeated?: boolean
  skipIfPresent?: string
}

const profileOperationCases: ProfileOperationCase[] = [
  { type: 'set', base: '5', value: '4+', expected: '4+' },
  { type: 'append', base: 'Assault', value: 'Lethal Hits', expected: 'Assault, Lethal Hits', join: ', ' },
  { type: 'prepend', base: 'Lethal Hits', value: 'Assault', expected: 'Assault, Lethal Hits', join: ', ' },
  { type: 'increment', base: 'D6+1', value: 2, expected: 'D6+3', position: -1 },
  { type: 'decrement', base: '6-2', value: 1, expected: '5-3' },
  { type: 'multiply', base: '2', value: 3, expected: '12', repeated: true },
  { type: 'divide', base: '12', value: 3, expected: '2', repeated: true },
  { type: 'modulo', base: '13', value: 5, expected: '3' },
  { type: 'power', base: '2', value: 3, expected: '64', repeated: true },
  { type: 'exponent', base: '2', value: 3, expected: '18', repeated: true },
  { type: 'triangular', base: '2', value: 3, expected: '11', repeated: true },
  { type: 'floor', base: '1', value: 2, expected: '2' },
  { type: 'ceil', base: '12"', value: 9, expected: '9"' },
  { type: 'cumulative-add', base: '2', value: 3, expected: '6.5', repeated: true },
  { type: 'cumulative-power', base: '2', value: 3, expected: '4', repeated: true },
  { type: 'cumulative-multiply', base: '2', value: 3, expected: '24', repeated: true },
  { type: 'replace', base: 'Rapid Fire 1, Assault', value: 'Rapid Fire 2', expected: 'Rapid Fire 2, Assault', arg: 'Rapid Fire 1' },
  { type: 'replace', base: 'Rapid Fire 1, Assault', expected: ', Assault', arg: 'Rapid Fire 1' },
  { type: 'append', base: 'Assault', value: 'Assault', expected: 'Assault', skipIfPresent: 'Assault' },
]

describe('the picker', () => {
  it('gives datasheets readable unambiguous route slugs', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'first-sheet', name: 'Royal Warden', type: 'unit', costs: points(40) },
        { id: 'second-sheet', name: 'Royal Warden', type: 'unit', costs: points(45) },
      ],
    })

    const units = unitsIn(book, 'cat', '')
    expect(units.map((unit) => unit.slug)).toEqual(['royal-warden-first-sh', 'royal-warden-second-s'])
    expect(datasheetInBySlug(book, 'cat', units[0]?.slug ?? '')?.id).toBe('first-sheet')
  })

  it('shelves a datasheet by the role its keywords claim', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'lord', name: 'Lord', type: 'model', costs: points(90), categoryLinks: categories('Infantry', 'Character') },
        { id: 'grunts', name: 'Grunts', type: 'unit', costs: points(70), categoryLinks: categories('Battleline') },
        { id: 'ride', name: 'Ride', type: 'unit', costs: points(60), categoryLinks: categories('Dedicated Transport') },
        { id: 'tank', name: 'Tank', type: 'unit', costs: points(150), categoryLinks: categories('Vehicle') },
      ],
    })
    expect(Object.fromEntries(unitsIn(book, 'cat', '').map((unit) => [unit.name, unit.group]))).toEqual({
      Lord: 'character',
      Grunts: 'battleline',
      Ride: 'transport',
      Tank: 'other',
    })
  })

  it('shelves a datasheet claiming no role at all under other', () => {
    const book = bookOf({ selectionEntries: [{ id: 'thing', name: 'Thing', type: 'unit', costs: points(10) }] })
    expect(unitsIn(book, 'cat', '')[0]?.group).toBe('other')
  })

  it('prices the smallest legal version of each datasheet', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          costs: points(0),
          selectionEntries: [
            {
              id: 'body',
              name: 'Body',
              type: 'model',
              costs: points(20),
              constraints: [{ id: 'body-min', type: 'min', value: 3, field: 'selections', scope: 'parent' }],
            },
          ],
        },
      ],
    })
    expect(unitsIn(book, 'cat', '')[0]?.points).toBe(60)
  })

  it('offers a datasheet the book reaches by a link', () => {
    // How most of the game is written: the datasheets live in a library, and a book
    // states its roster as links into it.
    const shelf = shelfOf(
      { entryLinks: [{ id: 'ours', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }] },
      { library: true, sharedSelectionEntries: [{ id: 'squad', name: 'Squad', type: 'unit', costs: points(70) }] },
    )
    expect(offered(shelf)).toEqual(['Squad'])
    expect(unitsIn(shelf, 'cat', '')[0]?.points).toBe(70)
  })

  it('offers the datasheets of a book it imports, and not of one it merely links', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [{ id: 'ours', name: 'Ours', type: 'unit', costs: points(10) }],
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          // Linked to reach the rules that mention it, not to field it.
          { targetId: 'cat-2' },
        ],
      },
      { selectionEntries: [{ id: 'theirs', name: 'Theirs', type: 'unit', costs: points(20) }] },
      { selectionEntries: [{ id: 'mentioned', name: 'Mentioned', type: 'unit', costs: points(30) }] },
    )
    expect(offered(shelf)).toEqual(['Ours', 'Theirs'])
  })

  it('offers a datasheet reached twice only once', () => {
    const shelf = shelfOf(
      {
        entryLinks: [{ id: 'ours', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }],
        catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }],
      },
      {
        library: true,
        sharedSelectionEntries: [{ id: 'squad', name: 'Squad', type: 'unit', costs: points(70) }],
        entryLinks: [{ id: 'theirs', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }],
      },
    )
    expect(unitsIn(shelf, 'cat', '').map((unit) => unit.id)).toEqual(['ours'])
  })

  it('leaves out a body that only exists inside a squad', () => {
    // A sergeant is a model entry sitting at the top of the file exactly as its
    // squad does; what makes the squad pickable is that the book links to it.
    const shelf = bookOf({
      sharedSelectionEntries: [
        { id: 'squad', name: 'Squad', type: 'unit', costs: points(70) },
        { id: 'sergeant', name: 'Sergeant', type: 'model', costs: points(20) },
      ],
      entryLinks: [{ id: 'ours', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }],
    })
    expect(offered(shelf)).toEqual(['Squad'])
  })

  it('never offers Legends datasheets', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'squad', name: 'Squad', type: 'unit', costs: points(70) },
        { id: 'old', name: 'Land Speeder [Legends]', type: 'unit', costs: points(60) },
      ],
    })
    expect(offered(book)).toEqual(['Squad'])
    expect(unitsIn(book, 'cat', 'Land Speeder')).toEqual([])
  })

  it('does not offer a library as a faction', () => {
    const shelf = shelfOf(
      { entryLinks: [{ id: 'ours', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }] },
      { library: true, sharedSelectionEntries: [{ id: 'squad', name: 'Squad', type: 'unit', costs: points(70) }] },
    )
    expect(shelf.factions.map((faction) => faction.id)).toEqual(['cat'])
  })
})

describe('detachment enhancements', () => {
  const detail = (...entries: NonNullable<Catalogue['sharedSelectionEntries']>) => {
    const loaded = bookOf({
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            { id: 'choices', name: 'Detachment', selectionEntries: [{ id: 'host', name: 'Plague Host', type: 'upgrade' }] },
          ],
        },
        ...entries,
      ],
    })
    return detachmentCatalogueDetail(loaded, 'cat', 'host', ['Living Relic'])?.enhancements[0]
  }

  it('finds description text without a detachment comment', () => {
    expect(
      detail({ id: 'relic', name: 'Living Relic', type: 'upgrade', profiles: [ability('relic-rule', 'Living Relic')] })?.description,
    ).toBe('Living Relic text')
  })

  it('prefers the entry named for the detachment', () => {
    expect(
      detail(
        { id: 'other', name: 'Living Relic', type: 'upgrade', comment: 'Other Host', profiles: [ability('other-rule', 'Other')] },
        { id: 'relic', name: 'Living Relic', type: 'upgrade', comment: 'Plague Host', profiles: [ability('relic-rule', 'Living Relic')] },
      )?.description,
    ).toBe('Living Relic text')
  })

  it('does not choose between conflicting descriptions', () => {
    expect(
      detail(
        { id: 'first', name: 'Living Relic', type: 'upgrade', profiles: [ability('first-rule', 'First')] },
        { id: 'second', name: 'Living Relic', type: 'upgrade', profiles: [ability('second-rule', 'Second')] },
      )?.description,
    ).toBeNull()
  })
})

describe('detachments', () => {
  it('resolve a linked group used by newer catalogues', () => {
    const file: CatalogueFile = {
      catalogue: {
        id: 'cat',
        name: 'Test catalogue',
        sharedSelectionEntries: [
          {
            id: 'wrapper',
            name: 'Detachment',
            type: 'upgrade',
            entryLinks: [{ id: 'link', name: 'Detachment', type: 'selectionEntryGroup', targetId: 'choices' }],
          },
        ],
        sharedSelectionEntryGroups: [
          {
            id: 'choices',
            name: 'Detachment',
            selectionEntries: [{ id: 'speed', name: 'Kult of Speed', type: 'upgrade' }],
          },
        ],
      },
    }
    const index = buildIndex([system, file], 'test-revision')
    expect(
      detachmentsOf([system, file], index)
        .get('cat')
        ?.options.map((option) => option.name),
    ).toEqual(['Kult of Speed'])
  })

  it('takes the detachments of the book it imports most of its roster from', () => {
    // A chapter has no detachment entry of its own and several books it can reach.
    // Which one it plays with is decided by which one it mostly is, not by which
    // holds the longer list: preferring the longer one gave World Eaters the
    // Daemons detachments and Adeptus Custodes the Knights ones.
    const auxiliary: CatalogueFile = {
      catalogue: {
        id: 'auxiliary',
        name: 'Auxiliary catalogue',
        selectionEntries: [{ id: 'agent', name: 'Agent', type: 'unit' }],
        sharedSelectionEntries: [
          {
            id: 'aux-wrapper',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: 'aux-choices',
                name: 'Detachment',
                selectionEntries: [
                  { id: 'auxiliary-force', name: 'Auxiliary Force', type: 'upgrade' },
                  { id: 'ordo', name: 'Ordo Xenos', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
    }
    const base: CatalogueFile = {
      catalogue: {
        id: 'base',
        name: 'Base catalogue',
        selectionEntries: [
          { id: 'marine', name: 'Marine', type: 'unit' },
          { id: 'tank', name: 'Tank', type: 'unit' },
          { id: 'scout', name: 'Scout', type: 'unit' },
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
                selectionEntries: [{ id: 'gladius', name: 'Gladius Task Force', type: 'upgrade' }],
              },
            ],
          },
        ],
      },
    }
    const supplement: CatalogueFile = {
      catalogue: {
        id: 'supplement',
        name: 'Supplement',
        catalogueLinks: [
          { targetId: 'auxiliary', importRootEntries: true },
          { targetId: 'base', importRootEntries: true },
        ],
      },
    }
    const files = [system, auxiliary, base, supplement]
    const index = buildIndex(files, 'test-revision')
    expect(
      detachmentsOf(files, index)
        .get('supplement')
        ?.options.map((option) => option.name),
    ).toEqual(['Gladius Task Force'])
  })

  it('leaves a book with the detachments it states itself', () => {
    // Even where a book it imports offers more of them.
    const parent: CatalogueFile = {
      catalogue: {
        id: 'parent',
        name: 'Parent catalogue',
        selectionEntries: [{ id: 'daemon', name: 'Daemon', type: 'unit' }],
        sharedSelectionEntries: [
          {
            id: 'parent-wrapper',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: 'parent-choices',
                name: 'Detachment',
                selectionEntries: [
                  { id: 'incursion', name: 'Daemonic Incursion', type: 'upgrade' },
                  { id: 'legion', name: 'Blood Legion', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
    }
    const own: CatalogueFile = {
      catalogue: {
        id: 'own',
        name: 'Own catalogue',
        catalogueLinks: [{ targetId: 'parent', importRootEntries: true }],
        sharedSelectionEntries: [
          {
            id: 'own-wrapper',
            name: 'Detachments',
            type: 'upgrade',
            selectionEntryGroups: [
              { id: 'own-choices', name: 'Detachment', selectionEntries: [{ id: 'warband', name: 'Berzerker Warband', type: 'upgrade' }] },
            ],
          },
        ],
      },
    }
    const files = [system, parent, own]
    const index = buildIndex(files, 'test-revision')
    expect(
      detachmentsOf(files, index)
        .get('own')
        ?.options.map((option) => option.name),
    ).toEqual(['Berzerker Warband'])
  })
})

describe('a datasheet', () => {
  it('collects model, weapon, ability and keyword display data', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          categoryLinks: categories('Infantry', 'Battleline'),
          profiles: [{ id: 'unit', name: 'Squad', typeName: 'Unit', characteristics: [{ name: 'T', $text: '4' }] }],
          selectionEntries: [
            {
              id: 'gun',
              name: 'Rifle',
              type: 'upgrade',
              profiles: [{ id: 'weapon', name: 'Rifle', typeName: 'Ranged Weapons', characteristics: [{ name: 'A', $text: '2' }] }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'squad')).toMatchObject({
      name: 'Squad',
      points: 0,
      keywords: ['Battleline', 'Infantry'],
      profiles: [
        { name: 'Squad', type: 'Unit', values: [{ name: 'T', value: '4' }] },
        { name: 'Rifle', type: 'Ranged Weapons', values: [{ name: 'A', value: '2' }] },
      ],
    })
  })

  it('shows only weapons carried by the selected unit when roster context is present', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'unit',
          selectionEntries: [
            {
              id: 'blade-entry',
              name: 'Blade',
              type: 'upgrade',
              profiles: [{ id: 'blade', name: 'Blade', typeName: 'Melee Weapons', characteristics: [{ name: 'S', $text: '5' }] }],
            },
            {
              id: 'spear-entry',
              name: 'Spear',
              type: 'upgrade',
              profiles: [{ id: 'spear', name: 'Spear', typeName: 'Melee Weapons', characteristics: [{ name: 'S', $text: '6' }] }],
            },
          ],
        },
      ],
    })
    const context = { selections: [{ id: 'captain', selections: [{ id: 'blade-entry', count: 1 }] }], unitSelectionIndex: 0 }
    expect(datasheetIn(book, 'cat', 'captain', context)?.profiles.map((profile) => profile.name)).toEqual(['Blade'])
  })

  it('applies profile modifiers from the selected detachment and preserves their source', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'cursed-legion', name: 'Cursed Legion', type: 'upgrade' },
        {
          id: 'immortals',
          name: 'Immortals',
          type: 'unit',
          profiles: [
            { id: 'immortal-blaster', name: 'Gauss blaster', typeName: 'Ranged Weapons', characteristics: [{ name: 'S', $text: '5' }] },
          ],
        },
      ],
      entryLinks: [{ id: 'destroyers', name: 'Destroyers', targetId: 'destroyer-sheet', type: 'selectionEntry' }],
      sharedSelectionEntries: [
        {
          id: 'destroyer-sheet',
          name: 'Destroyers',
          type: 'unit',
          selectionEntries: [
            {
              id: 'blade-entry',
              name: 'Blade',
              type: 'upgrade',
              profiles: [
                {
                  id: 'blade',
                  name: 'Blade',
                  typeName: 'Melee Weapons',
                  characteristics: [{ name: 'S', typeId: 'melee-strength', $text: '5' }],
                },
              ],
            },
            {
              id: 'claw-entry',
              name: 'Claw',
              type: 'upgrade',
              profiles: [
                {
                  id: 'claw',
                  name: 'Claw',
                  typeName: 'Melee Weapons',
                  characteristics: [{ name: 'S', typeId: 'melee-strength', $text: '4' }],
                },
              ],
            },
          ],
          modifierGroups: [
            {
              conditions: [
                {
                  type: 'atLeast',
                  value: 1,
                  field: 'selections',
                  scope: 'force',
                  childId: 'cursed-legion',
                  includeChildSelections: true,
                },
              ],
              modifiers: [
                {
                  type: 'increment',
                  value: 2,
                  field: 'melee-strength',
                  scope: 'root-entry',
                  affects: 'self.entries.recursive.blade-entry.profiles.Melee Weapons',
                },
              ],
            },
          ],
        },
      ],
    })

    expect(
      datasheetIn(book, 'cat', 'destroyers', {
        selections: [{ id: 'cursed-legion' }, { id: 'destroyers' }],
      })?.profiles[0]?.values[0],
    ).toEqual({ name: 'S', value: '7', baseValue: '5', modifiers: ['Cursed Legion'] })
    expect(
      datasheetIn(book, 'cat', 'destroyers', {
        selections: [{ id: 'cursed-legion' }, { id: 'destroyers' }],
      })?.profiles[1]?.values[0],
    ).toEqual({ name: 'S', value: '4' })
    expect(datasheetIn(book, 'cat', 'destroyers')?.profiles[0]?.values[0]).toEqual({ name: 'S', value: '5' })
    expect(
      datasheetIn(book, 'cat', 'immortals', {
        selections: [{ id: 'cursed-legion' }, { id: 'destroyers' }, { id: 'immortals' }],
        unitSelectionIndex: 1,
      })?.profiles[0]?.values[0],
    ).toEqual({ name: 'S', value: '5' })
  })

  it.each(profileOperationCases)(
    'applies the $type profile operation',
    ({ type, base, value, expected, position, join, arg, repeated, skipIfPresent }) => {
      const book = bookOf({
        selectionEntries: [
          {
            id: 'unit',
            name: 'Unit',
            type: 'unit',
            profiles: [
              { id: 'profile', name: 'Profile', typeName: 'Unit', characteristics: [{ name: 'M', typeId: 'field', $text: base }] },
            ],
            selectionEntries: [{ id: 'body', name: 'Body', type: 'model' }],
            modifiers: [
              {
                type,
                field: 'field',
                value,
                position,
                join,
                arg,
                skipIfPresent,
                affects: 'profiles.Unit',
                repeats: repeated ? [{ value: 1, field: 'selections', scope: 'self', childId: 'model' }] : undefined,
              },
            ],
          },
        ],
      })
      const sheet = datasheetIn(book, 'cat', 'unit', {
        selections: [{ id: 'unit', selections: [{ id: 'body', count: 2 }] }],
      })
      expect(sheet?.profiles[0]?.values[0]?.value).toBe(expected)
    },
  )

  it('applies profile name and annotation modifiers', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [{ id: 'profile', name: 'Blade', typeName: 'Melee Weapons', characteristics: [{ name: 'S', $text: '5' }] }],
          modifiers: [
            { type: 'append', field: 'name', value: 'Masterwork', join: ' — ', affects: 'profiles.Melee Weapons' },
            { type: 'append', field: 'annotation', value: 'Cold Fervour', join: ', ', affects: 'profiles.Melee Weapons' },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }] })?.profiles[0]?.name).toBe('Blade — Masterwork (Cold Fervour)')
  })

  it('applies modifiers declared directly on a profile', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            {
              id: 'profile',
              name: 'Blade',
              typeName: 'Melee Weapons',
              characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }],
              modifiers: [{ type: 'increment', field: 'strength', value: 2 }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }] })?.profiles[0]?.values[0]?.value).toBe('7')
  })

  it('applies modifiers declared on a linked profile', () => {
    const book = bookOf({
      sharedProfiles: [
        {
          id: 'shared-profile',
          name: 'Blade',
          typeName: 'Melee Weapons',
          characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }],
        },
      ],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          infoLinks: [
            {
              id: 'profile-link',
              targetId: 'shared-profile',
              type: 'profile',
              modifiers: [{ type: 'increment', field: 'strength', value: 2 }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }] })?.profiles[0]?.values[0]?.value).toBe('7')
  })

  it('applies profile visibility modifiers', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            {
              id: 'revealed',
              name: 'Revealed',
              typeName: 'Unit',
              hidden: true,
              characteristics: [{ name: 'M', $text: '5"' }],
              modifiers: [{ type: 'set', field: 'hidden', value: false }],
            },
            {
              id: 'concealed',
              name: 'Concealed',
              typeName: 'Unit',
              characteristics: [{ name: 'M', $text: '6"' }],
              modifiers: [{ type: 'set', field: 'hidden', value: true }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }] })?.profiles.map(({ name }) => name)).toEqual(['Revealed'])
  })

  it('evaluates profile conditions against the complete roster', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            { id: 'profile', name: 'Blade', typeName: 'Melee Weapons', characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }] },
          ],
          modifiers: [
            {
              type: 'increment',
              field: 'strength',
              value: 2,
              affects: 'self.entries.recursive.profiles.Melee Weapons',
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'force', childId: 'support' }],
            },
          ],
        },
        { id: 'support', name: 'Support', type: 'unit' },
      ],
    })
    const value = (selections: { id: string }[]) => datasheetIn(book, 'cat', 'unit', { selections })?.profiles[0]?.values[0]?.value
    expect(value([{ id: 'unit' }, { id: 'support' }])).toBe('7')
    expect(value([{ id: 'unit' }])).toBe('5')
  })

  it('uses the selected copy when a roster contains duplicate datasheets', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            { id: 'profile', name: 'Blade', typeName: 'Melee Weapons', characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }] },
          ],
          selectionEntries: [{ id: 'boost', name: 'Boost', type: 'upgrade' }],
          modifiers: [
            {
              type: 'increment',
              field: 'strength',
              value: 2,
              affects: 'self.entries.recursive.profiles.Melee Weapons',
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'self', childId: 'boost' }],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'unit', selections: [{ id: 'boost' }] }, { id: 'unit' }]
    expect(datasheetIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 0 })?.profiles[0]?.values[0]?.value).toBe('7')
    expect(datasheetIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 1 })?.profiles[0]?.values[0]?.value).toBe('5')
  })

  it('separates faction, core, datasheet, rule and wargear abilities', () => {
    const book = bookOf({
      sharedProfiles: [ability('shared-ability', 'My Will Be Done')],
      sharedRules: [
        { id: 'faction-rule', name: 'Reanimation Protocols', description: 'Reanimate.' },
        { id: 'core-rule', name: 'Leader', description: 'Attach this model.' },
      ],
      sharedSelectionEntries: [{ id: 'orb', name: 'Orb', type: 'upgrade', profiles: [ability('orb-ability', 'Resurrection Orb')] }],
      selectionEntries: [
        {
          id: 'lord',
          name: 'Lord',
          type: 'model',
          profiles: [ability('own-ability', 'Translocation Shroud')],
          infoLinks: [
            { id: 'faction-link', targetId: 'faction-rule', name: 'Reanimation Protocols', type: 'rule' },
            { id: 'shared-link', targetId: 'shared-ability', name: 'My Will Be Done', type: 'profile' },
          ],
          infoGroups: [
            {
              id: 'leader-group',
              name: 'Leader',
              profiles: [ability('leader-ability', 'Leader')],
              infoLinks: [{ id: 'core-link', targetId: 'core-rule', name: 'Leader', type: 'rule' }],
            },
          ],
          entryLinks: [{ id: 'orb-link', targetId: 'orb', name: 'Orb', type: 'selectionEntry' }],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'lord')?.abilities.map(({ name, kind }) => [name, kind])).toEqual([
      ['Translocation Shroud', 'datasheet'],
      ['Leader', 'rule'],
      ['Leader', 'core'],
      ['Reanimation Protocols', 'faction'],
      ['My Will Be Done', 'datasheet'],
      ['Resurrection Orb', 'wargear'],
    ])
  })

  it('keeps definitions for linked weapon keywords', () => {
    const book = bookOf({
      sharedRules: [{ id: 'devastating', name: 'Devastating Wounds', description: 'Critical wounds inflict mortal wounds.' }],
      sharedSelectionEntries: [
        {
          id: 'blade',
          name: 'Blade',
          type: 'upgrade',
          infoLinks: [{ id: 'devastating-link', targetId: 'devastating', name: 'Devastating Wounds', type: 'rule' }],
          profiles: [
            {
              id: 'blade-profile',
              name: 'Blade',
              typeName: 'Melee Weapons',
              characteristics: [{ name: 'Keywords', $text: 'Devastating Wounds' }],
            },
          ],
        },
      ],
      selectionEntries: [
        {
          id: 'lord',
          name: 'Lord',
          type: 'model',
          entryLinks: [{ id: 'blade-link', targetId: 'blade', name: 'Blade', type: 'selectionEntry' }],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'lord')?.keywordRules).toEqual([
      { name: 'Devastating Wounds', description: 'Critical wounds inflict mortal wounds.' },
    ])
  })

  it('finds rule definitions referenced by catalogue formatting', () => {
    const book = bookOf({
      sharedRules: [
        { id: 'feel-no-pain', name: 'Feel No Pain', description: 'Ignore lost wounds.' },
        { id: 'lethal-hits', name: 'Lethal Hits', description: 'Critical hits wound automatically.' },
      ],
    })
    expect(rulesReferencedIn(book, ['This model has **Feel No Pain 4+**, [LETHAL HITS] and ^^**VEHICLE^^**.'])).toEqual([
      { name: 'Feel No Pain', description: 'Ignore lost wounds.' },
      { name: 'Lethal Hits', description: 'Critical hits wound automatically.' },
    ])
  })
})
