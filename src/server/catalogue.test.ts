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
  const files = catalogues.map((catalogue, at): CatalogueFile => ({
    catalogue: { id: at ? `cat-${at}` : 'cat', name: at ? `Book ${at}` : 'Test catalogue', ...catalogue },
  }))
  const index = buildIndex([system, ...files], 'test-revision')
  return {
    index,
    factions: factionsIn(index, detachmentsOf(files, index)),
    detachments: detachmentsOf(files, index),
    factionContents: new Map(),
  }
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

  it('omits datasheets excluded by faction rules', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'allowed', name: 'Intercessor Squad', type: 'unit', costs: points(80) },
        { id: 'excluded', name: 'Scout Squad', type: 'unit', costs: points(70) },
      ],
    })
    expect(
      unitsIn(book, 'cat', '', {
        restrictions: { excludedNames: new Set(['scout squad']), excludedKeywords: new Set() },
      }).map((unit) => unit.name),
    ).toEqual(['Intercessor Squad'])
  })

  it('omits datasheets excluded by a faction keyword rule', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'marshal', name: 'Marshal', type: 'model', costs: points(80), categoryLinks: categories('Character') },
        { id: 'librarian', name: 'Librarian', type: 'model', costs: points(90), categoryLinks: categories('Character', 'Psyker') },
      ],
    })
    expect(
      unitsIn(book, 'cat', '', {
        restrictions: { excludedNames: new Set(), excludedKeywords: new Set(['psyker']) },
      }).map((unit) => unit.name),
    ).toEqual(['Marshal'])
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

  it('marks secondary imported books as allies while keeping the main imported roster primary', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [{ id: 'ours', name: 'Ours', type: 'unit', costs: points(10) }],
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          { targetId: 'cat-2', importRootEntries: true },
          { targetId: 'cat-3', importRootEntries: true },
        ],
      },
      {
        selectionEntries: [
          { id: 'main-one', name: 'Main One', type: 'unit', costs: points(20) },
          { id: 'main-two', name: 'Main Two', type: 'unit', costs: points(20) },
        ],
      },
      { selectionEntries: [{ id: 'agent', name: 'Agent', type: 'unit', costs: points(30) }] },
      { selectionEntries: [{ id: 'knight', name: 'Knight', type: 'unit', costs: points(40) }] },
    )

    expect(Object.fromEntries(unitsIn(shelf, 'cat', '').map((unit) => [unit.name, unit.alliedFaction]))).toEqual({
      'Main One': null,
      'Main Two': null,
      Ours: null,
      Agent: 'Book 2',
      Knight: 'Book 3',
    })
  })

  it('keeps allied units after the limited primary page', () => {
    const shelf = shelfOf(
      {
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          { targetId: 'cat-2', importRootEntries: true },
        ],
      },
      {
        selectionEntries: [
          { id: 'alpha', name: 'Alpha', type: 'unit', costs: points(20) },
          { id: 'bravo', name: 'Bravo', type: 'unit', costs: points(20) },
        ],
      },
      { selectionEntries: [{ id: 'ally', name: 'Aaron the Ally', type: 'unit', costs: points(30) }] },
    )

    expect(unitsIn(shelf, 'cat', '', { limit: 1 }).map((unit) => [unit.name, unit.alliedFaction])).toEqual([
      ['Alpha', null],
      ['Aaron the Ally', 'Book 2'],
    ])
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
        { id: 'crucible', name: 'Champion [Crucible]', type: 'unit', costs: points(60) },
      ],
    })
    expect(offered(book)).toEqual(['Squad'])
    expect(unitsIn(book, 'cat', 'Land Speeder')).toEqual([])
    expect(unitsIn(book, 'cat', 'Crucible')).toEqual([])
  })

  it('never offers mission assets from the Unaligned Forces shelf', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [{ id: 'ours', name: 'Squad', type: 'unit', costs: points(70) }],
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          { targetId: 'cat-2', importRootEntries: true },
        ],
      },
      {
        selectionEntries: [
          { id: 'main-one', name: 'Main One', type: 'unit', costs: points(20) },
          { id: 'main-two', name: 'Main Two', type: 'unit', costs: points(20) },
        ],
      },
      { selectionEntries: [{ id: 'sentry', name: 'Sentry Gun', type: 'model', costs: points(40) }], name: 'Unaligned Forces' },
    )

    expect(offered(shelf)).toEqual(['Main One', 'Main Two', 'Squad'])
    expect(unitsIn(shelf, 'cat', 'Sentry Gun')).toEqual([])

    const onlyImport = shelfOf(
      { catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }] },
      { selectionEntries: [{ id: 'sentry', name: 'Sentry Gun', type: 'model', costs: points(40) }], name: 'Unaligned Forces' },
    )
    expect(unitsIn(onlyImport, 'cat', '')).toEqual([])
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

  it('matches an aura suffix supplied by the rules source', () => {
    expect(
      detail({ id: 'relic', name: 'Living Relic (Aura)', type: 'upgrade', profiles: [ability('relic-rule', 'Living Relic')] })?.description,
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

  it('finds an enhancement the detachment makes mandatory on its bearer', () => {
    const loaded = bookOf({
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            { id: 'choices', name: 'Detachment', selectionEntries: [{ id: 'host', name: 'Pantheon', type: 'upgrade' }] },
          ],
        },
        {
          id: 'binding',
          name: 'Singularity Matrix',
          type: 'upgrade',
          hidden: true,
          costs: points(45),
          constraints: [{ id: 'binding-min', type: 'min', value: 0, field: 'selections', scope: 'parent' }],
          profiles: [ability('binding-rule', 'Singularity Matrix')],
          modifierGroups: [
            {
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'force', childId: 'host' }],
              modifiers: [{ type: 'set', field: 'binding-min', value: 1 }],
            },
          ],
        },
      ],
    })

    expect(detachmentCatalogueDetail(loaded, 'cat', 'host', [])?.forcedEnhancements).toEqual([
      { name: 'Singularity Matrix', points: 45, description: 'Singularity Matrix text' },
    ])
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

  it('shows duplicate available profiles once', () => {
    const profile = (id: string, name = 'Storm bolter') => ({
      id,
      name,
      typeName: 'Ranged Weapons',
      characteristics: [{ name: 'A', $text: '2' }],
    })
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            { id: 'first-bolter', name: 'Storm bolter', type: 'upgrade', profiles: [profile('first-profile')] },
            { id: 'second-bolter', name: 'Storm Bolter', type: 'upgrade', profiles: [profile('second-profile', 'Storm Bolter')] },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'squad')?.profiles.map(({ name }) => name)).toEqual(['Storm bolter'])
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

  it('uses the carried wargear quantity for weapon profiles', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            {
              id: 'models',
              name: 'Troopers',
              type: 'model',
              selectionEntries: [
                {
                  id: 'rifle-entry',
                  name: 'Bolt rifle',
                  type: 'upgrade',
                  profiles: [{ id: 'rifle', name: 'Bolt rifle', typeName: 'Ranged Weapons', characteristics: [{ name: 'A', $text: '2' }] }],
                },
              ],
            },
          ],
        },
      ],
    })
    const context = {
      selections: [{ id: 'squad', selections: [{ id: 'models', count: 4, selections: [{ id: 'rifle-entry', count: 1 }] }] }],
      unitSelectionIndex: 0,
    }

    expect(datasheetIn(book, 'cat', 'squad', context)?.profiles).toMatchObject([{ name: 'Bolt rifle', count: 4 }])
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

  it('keeps root-entry profile modifiers inside their selected unit', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'destroyer',
          name: 'Destroyer',
          type: 'unit',
          profiles: [
            {
              id: 'destroyer-blade',
              name: 'Blade',
              typeName: 'Melee Weapons',
              characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }],
            },
          ],
          modifiers: [
            { type: 'increment', field: 'strength', value: 2, scope: 'root-entry', affects: 'self.entries.profiles.Melee Weapons' },
          ],
        },
        {
          id: 'immortals',
          name: 'Immortals',
          type: 'unit',
          profiles: [
            {
              id: 'immortals-blade',
              name: 'Blade',
              typeName: 'Melee Weapons',
              characteristics: [{ name: 'S', typeId: 'strength', $text: '4' }],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'destroyer' }, { id: 'immortals' }]

    expect(datasheetIn(book, 'cat', 'destroyer', { selections, unitSelectionIndex: 0 })?.profiles[0]?.values[0]?.value).toBe('7')
    expect(datasheetIn(book, 'cat', 'immortals', { selections, unitSelectionIndex: 1 })?.profiles[0]?.values[0]?.value).toBe('4')
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

  it('shows a unit enhancement ability only when the enhancement is selected', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'immortals',
          name: 'Immortals',
          type: 'unit',
          profiles: [ability('intrinsic', 'Implacable Eradication')],
          selectionEntryGroups: [
            {
              id: 'enhancements',
              name: 'Enhancements',
              selectionEntries: [
                { id: 'tools', name: 'Tools of Dominion', type: 'upgrade', profiles: [ability('tools-ability', 'Tools of Dominion')] },
              ],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'immortals')?.abilities.map(({ name }) => name)).toEqual(['Implacable Eradication'])
    expect(
      datasheetIn(book, 'cat', 'immortals', {
        selections: [{ id: 'immortals', selections: [{ id: 'enhancements', selections: [{ id: 'tools' }] }] }],
        unitSelectionIndex: 0,
      })?.abilities.map(({ name }) => name),
    ).toEqual(['Implacable Eradication', 'Tools of Dominion'])
  })

  it('classifies game-system rules linked by a datasheet as core abilities', () => {
    const loaded = shelfOf({
      sharedRules: [{ id: 'faction-rule', name: 'Faction rule', description: 'Faction text.' }],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          infoLinks: [
            { id: 'core-link', targetId: 'core-rule', name: 'Core rule', type: 'rule' },
            { id: 'faction-link', targetId: 'faction-rule', name: 'Faction rule', type: 'rule' },
          ],
        },
      ],
    })
    loaded.index.rules.set('core-rule', { id: 'core-rule', name: 'Core rule', description: 'Core text.' })
    loaded.index.ruleCatalogueOf.set('core-rule', 'gs')

    expect(datasheetIn(loaded, 'cat', 'unit')?.abilities.map(({ name, kind }) => [name, kind])).toEqual([
      ['Core rule', 'core'],
      ['Faction rule', 'faction'],
    ])
  })

  it('hides core abilities that require an attachment when no attachment is present', () => {
    const loaded = shelfOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          infoLinks: [
            {
              id: 'conditional-link',
              targetId: 'core-rule',
              name: 'Conditional rule',
              type: 'rule',
              modifiers: [
                {
                  type: 'set',
                  field: 'hidden',
                  value: true,
                  conditions: [{ type: 'lessThan', field: 'associations', scope: 'self', childId: 'leader', value: 1 }],
                },
              ],
            },
          ],
        },
      ],
    })
    loaded.index.rules.set('core-rule', { id: 'core-rule', name: 'Conditional rule', description: 'Conditional text.' })
    loaded.index.ruleCatalogueOf.set('core-rule', 'gs')

    expect(datasheetIn(loaded, 'cat', 'unit')?.abilities).toEqual([])
  })

  it('lists the choices available on a datasheet as wargear options', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'weapons',
              name: 'Weapons',
              constraints: [{ id: 'weapons-max', type: 'max', scope: 'parent', field: 'selections', value: 1 }],
              selectionEntries: [
                { id: 'rifle', name: 'Rifle', type: 'upgrade' },
                { id: 'pistol', name: 'Pistol', type: 'upgrade' },
              ],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'unit')?.wargearOptions).toEqual(['**Weapons:** Rifle; Pistol.'])
  })

  it('applies values appended to core rule names', () => {
    const book = bookOf({
      sharedRules: [
        { id: 'feel-no-pain', name: 'Feel No Pain', description: 'Ignore wounds.' },
        { id: 'deadly-demise', name: 'Deadly Demise', description: 'Explode.' },
      ],
      selectionEntries: [
        {
          id: 'ctan',
          name: "C'tan Shard",
          type: 'model',
          infoLinks: [
            {
              id: 'feel-no-pain-link',
              targetId: 'feel-no-pain',
              name: 'Feel No Pain',
              type: 'rule',
              modifiers: [{ type: 'append', field: 'name', value: '5+' }],
            },
            {
              id: 'deadly-demise-link',
              targetId: 'deadly-demise',
              name: 'Deadly Demise',
              type: 'rule',
              modifiers: [{ type: 'append', field: 'name', value: 'D6' }],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'ctan')?.abilities.map((rule) => rule.name)).toEqual(['Feel No Pain 5+', 'Deadly Demise D6'])
  })

  it('keeps an upgrade name when its embedded ability has a different title', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'deceiver',
          name: "C'tan Shard of the Deceiver",
          type: 'model',
          selectionEntries: [
            {
              id: 'matrix',
              name: 'Singularity Matrix',
              type: 'upgrade',
              profiles: [ability('deceit', 'Lord of Deceit (Aura)')],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'deceiver')?.abilities[0]).toMatchObject({
      name: 'Lord of Deceit (Aura)',
      source: 'Singularity Matrix',
    })
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
