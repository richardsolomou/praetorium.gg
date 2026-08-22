import { describe, expect, it } from 'vitest'
import { datasheetInBySlug } from './catalogue'
import { unitsIn } from './cataloguePicker'
import { bookOf, categories, offered, points, shelfOf } from './catalogue.fixtures'

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

  it('filters a cached priced faction list without rebuilding its summaries', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'warden', name: 'Royal Warden', type: 'unit', costs: points(40) },
        { id: 'warriors', name: 'Necron Warriors', type: 'unit', costs: points(100) },
      ],
    })
    const all = unitsIn(book, 'cat', '')
    const filtered = unitsIn(book, 'cat', 'warden')

    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toBe(all[1])
  })

  it('shelves every datasheet by its primary category', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'hero', name: 'Hero', type: 'model', costs: points(100), categoryLinks: categories('Epic Hero', 'Character', 'Infantry') },
        { id: 'lord', name: 'Lord', type: 'model', costs: points(90), categoryLinks: categories('Character', 'Infantry') },
        { id: 'grunts', name: 'Grunts', type: 'unit', costs: points(70), categoryLinks: categories('Battleline') },
        { id: 'troops', name: 'Troops', type: 'unit', costs: points(80), categoryLinks: categories('Infantry') },
        { id: 'critters', name: 'Critters', type: 'unit', costs: points(30), categoryLinks: categories('Swarm') },
        { id: 'riders', name: 'Riders', type: 'unit', costs: points(75), categoryLinks: categories('Mounted') },
        { id: 'hounds', name: 'Hounds', type: 'unit', costs: points(65), categoryLinks: categories('Beast') },
        { id: 'giant', name: 'Giant', type: 'unit', costs: points(175), categoryLinks: categories('Monster') },
        { id: 'tank', name: 'Tank', type: 'unit', costs: points(150), categoryLinks: categories('Vehicle') },
        { id: 'drone', name: 'Drone', type: 'unit', costs: points(50), categoryLinks: categories('Drone') },
        { id: 'ride', name: 'Ride', type: 'unit', costs: points(60), categoryLinks: categories('Dedicated Transport', 'Vehicle') },
        { id: 'wall', name: 'Wall', type: 'unit', costs: points(85), categoryLinks: categories('Fortification') },
      ],
    })
    expect(Object.fromEntries(unitsIn(book, 'cat', '').map((unit) => [unit.name, unit.group]))).toEqual({
      Hero: 'epic-hero',
      Lord: 'character',
      Grunts: 'battleline',
      Troops: 'infantry',
      Critters: 'swarm',
      Riders: 'mounted',
      Hounds: 'beast',
      Giant: 'monster',
      Tank: 'vehicle',
      Drone: 'drone',
      Ride: 'transport',
      Wall: 'fortification',
    })
  })

  it('shelves a datasheet with no recognised primary category under other', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'missing', name: 'Missing', type: 'unit', costs: points(10) },
        { id: 'unsupported', name: 'Unsupported', type: 'unit', costs: points(20), categoryLinks: categories('Pilot', 'Infantry') },
      ],
    })
    expect(Object.fromEntries(unitsIn(book, 'cat', '').map((unit) => [unit.name, unit.group]))).toEqual({
      Missing: 'other',
      Unsupported: 'other',
    })
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

  it('offers the whole book, not the first page of it', () => {
    // A book runs to well over a hundred datasheets and the picker sorts them by
    // name, so anything cut off the end takes the back half of the alphabet with it:
    // a Space Marine player could find no Sternguard on any shelf.
    const names = Array.from({ length: 120 }, (_, at) => `Squad ${String(at).padStart(3, '0')}`)
    const book = bookOf({
      selectionEntries: names.map((name, at) => ({ id: `unit-${at}`, name, type: 'unit', costs: points(10) })),
    })
    expect(offered(book)).toEqual(names)
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

  it('uses faction categories when the first imported book is an allied roster', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [
          { id: 'mechanicus', name: 'Skitarii', type: 'unit', costs: points(10), categoryLinks: categories('Faction: Adeptus Mechanicus') },
        ],
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          { targetId: 'cat-2', importRootEntries: true },
        ],
      },
      {
        selectionEntries: [
          { id: 'callidus', name: 'Callidus Assassin', type: 'model', costs: points(100), categoryLinks: categories('Faction: Agents') },
          { id: 'vindicary', name: 'Vindicare Assassin', type: 'model', costs: points(100), categoryLinks: categories('Faction: Agents') },
        ],
      },
      {
        selectionEntries: [
          {
            id: 'common',
            name: 'Common Mechanicus Unit',
            type: 'unit',
            costs: points(20),
            categoryLinks: categories('Faction: Adeptus Mechanicus'),
          },
        ],
      },
    )

    expect(Object.fromEntries(unitsIn(shelf, 'cat', '').map((unit) => [unit.name, unit.alliedFaction]))).toEqual({
      Skitarii: null,
      'Common Mechanicus Unit': null,
      'Callidus Assassin': 'Book 1',
      'Vindicare Assassin': 'Book 1',
    })
  })

  it('marks a directly linked datasheet from another faction as allied', () => {
    const shelf = shelfOf(
      {
        name: 'Genestealer Cults',
        selectionEntries: [
          { id: 'cultists', name: 'Cultists', type: 'unit', costs: points(10), categoryLinks: categories('Faction: Genestealer Cults') },
        ],
        entryLinks: [{ id: 'cadians', name: 'Cadian Shock Troops', targetId: 'cadian-target', type: 'selectionEntry' }],
        catalogueLinks: [{ targetId: 'cat-1' }],
      },
      {
        name: 'Astra Militarum Library',
        selectionEntries: [
          {
            id: 'cadian-target',
            name: 'Cadian Shock Troops',
            type: 'unit',
            costs: points(60),
            categoryLinks: categories('Faction: Astra Militarum'),
          },
        ],
      },
    )

    expect(unitsIn(shelf, 'cat', '').find((unit) => unit.name === 'Cadian Shock Troops')?.alliedFaction).toBe('Astra Militarum Library')
  })

  it('keeps allied units after the whole primary book', () => {
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

    expect(unitsIn(shelf, 'cat', '').map((unit) => [unit.name, unit.alliedFaction])).toEqual([
      ['Alpha', null],
      ['Bravo', null],
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
