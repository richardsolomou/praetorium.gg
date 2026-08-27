import { describe, expect, it } from 'vitest'
import {
  calculateRosterPrice,
  choiceOptionsForPricing,
  deploymentRules,
  heldWargear,
  isCatalogueSelfContradiction,
  factionRestrictionViolations,
  findEnhancementDescription,
  kotcViolations,
  resolveDisposition,
  uniqueNames,
} from './pricing'
import { descriptionKey } from './datacards'
import { bookOf } from './catalogue.fixtures'
import type { LoadedRules } from './rules'

describe('force disposition', () => {
  it('uses the only available disposition', () => {
    expect(resolveDisposition(['reconnaissance'], null)).toEqual({ disposition: 'reconnaissance', error: null })
  })

  it('requires a choice when several are available', () => {
    expect(resolveDisposition(['reconnaissance', 'disruption'], null)).toEqual({ disposition: null, error: 'Pick a disposition.' })
  })

  it('keeps a valid choice', () => {
    expect(resolveDisposition(['reconnaissance', 'disruption'], 'disruption')).toEqual({ disposition: 'disruption', error: null })
  })

  it('does not restore a catalogue disposition when the rules reference is unknown', () => {
    const loaded = bookOf({
      name: 'Death Guard',
      selectionEntries: [{ id: 'plague-marine', name: 'Plague Marine', type: 'unit' }],
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
                {
                  id: 'flyblown-host',
                  name: 'Flyblown Host',
                  type: 'upgrade',
                  categoryLinks: [{ id: 'disruption', name: 'Disruption', targetId: 'disruption' }],
                },
              ],
            },
          ],
        },
      ],
    })
    const rules = {
      factionKeys: new Map([['death-guard', 'death-guard']]),
      detachmentReferences: new Map([
        ['death-guard', new Map([['flyblown-host', { enhancements: 0, upgrades: 0, stratagems: 0, points: null, dispositions: [] }]])],
      ]),
      detachmentDetails: new Map(),
      factionRestrictions: new Map(),
    } as Partial<LoadedRules> as LoadedRules

    expect(
      calculateRosterPrice(
        { catalogueId: 'cat', detachmentIds: ['flyblown-host'], disposition: null, limit: 2_000, units: [] },
        loaded,
        rules,
      ),
    ).toMatchObject({ disposition: null, dispositions: [] })
  })

  it('prices compact catalogue detachment names from their rules references', () => {
    const loaded = bookOf({
      name: 'Adeptus Mechanicus',
      selectionEntries: [{ id: 'skitarii', name: 'Skitarii', type: 'unit' }],
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
                {
                  id: 'haloscreed',
                  name: 'Haloscreed Battleclade',
                  type: 'upgrade',
                  categoryLinks: [{ id: 'haloscreed-disruption', name: 'Disruption', targetId: 'disruption' }],
                },
                {
                  id: 'lords',
                  name: 'Lords of the Forge',
                  type: 'upgrade',
                  categoryLinks: [{ id: 'lords-disruption', name: 'Disruption', targetId: 'disruption' }],
                },
              ],
            },
          ],
        },
      ],
    })
    const detail = (id: string, name: string, points: number) => ({
      id,
      name,
      points,
      dispositions: ['priority-assets'],
      rules: [],
      enhancements: [],
      upgrades: [],
      stratagems: [],
    })
    const references = new Map([
      ['haloscreed-battle-clade', { enhancements: 0, upgrades: 0, stratagems: 0, points: 3, dispositions: ['priority-assets'] }],
      ['lords-of-the-forge', { enhancements: 0, upgrades: 0, stratagems: 0, points: 1, dispositions: ['priority-assets'] }],
    ])
    const rules = {
      factionKeys: new Map([['adeptus-mechanicus', 'adeptus-mechanicus']]),
      detachmentReferences: new Map([['adeptus-mechanicus', references]]),
      detachmentDetails: new Map([
        [
          'adeptus-mechanicus',
          new Map([
            ['haloscreed-battle-clade', detail('haloscreed-battle-clade', 'Haloscreed Battle Clade', 3)],
            ['lords-of-the-forge', detail('lords-of-the-forge', 'Lords of the Forge', 1)],
          ]),
        ],
      ]),
      factionRestrictions: new Map(),
    } as Partial<LoadedRules> as LoadedRules

    expect(
      calculateRosterPrice(
        { catalogueId: 'cat', detachmentIds: ['haloscreed', 'lords'], disposition: null, limit: 2_000, units: [] },
        loaded,
        rules,
      ),
    ).toMatchObject({
      detachments: [
        { name: 'Haloscreed Battleclade', points: 3 },
        { name: 'Lords of the Forge', points: 1 },
      ],
      detachmentPointsSpent: 4,
      detachmentPointsOver: true,
      detachmentError: 'This combination costs 4 DP; multiple detachments at this battle size may cost at most 3 DP.',
      disposition: 'priority-assets',
      dispositions: ['priority-assets'],
    })
  })
})

describe('enhancement descriptions', () => {
  it('treats a malformed choice without options as empty', () => {
    expect(choiceOptionsForPricing({})).toEqual([])
  })

  it('lists an enhancement once when the choice and built wargear both contain it', () => {
    expect(uniqueNames(['Demanding Leader', 'Demanding Leader'])).toEqual(['Demanding Leader'])
  })

  it('matches an aura suffix supplied by the rules source', () => {
    const descriptions = new Map([[descriptionKey('Awakened Dynasty', 'Phasal Subjugator (Aura)'), 'Improve nearby attacks.']])

    expect(findEnhancementDescription(descriptions, [{ name: 'Awakened Dynasty' }], 'Phasal Subjugator')).toBe('Improve nearby attacks.')
  })
})

describe('catalogue-backed deployment rules', () => {
  it('derives every supported pre-battle option from ability names', () => {
    expect(deploymentRules(['Deep Strike', 'Infiltrators', 'Scouts 6"'])).toEqual({
      formationOptions: ['deep-strike'],
      prebattleRules: ['infiltrators', 'scouts'],
    })
  })

  it('does not invent deployment options without matching abilities', () => {
    expect(deploymentRules(['Leader', 'Stealth'])).toEqual({ formationOptions: [], prebattleRules: [] })
  })
})

describe('faction army restrictions', () => {
  it('reports prohibited datasheets and keywords through roster legality', () => {
    const restrictions = { excludedNames: new Map([['scout squad', null]]), excludedKeywords: new Set(['psyker']) }
    const units = [
      { entryId: 'scouts', name: 'Scout Squad', keywords: ['Infantry'], toughness: 4, warlord: false },
      { entryId: 'librarian', name: 'Librarian', keywords: ['Character', 'Psyker'], toughness: 4, warlord: false },
    ]
    expect(factionRestrictionViolations(restrictions, units).map((error) => error.entryId)).toEqual(['scouts', 'librarian'])
  })

  it('lets a unit carrying the exempting keyword through a named exclusion', () => {
    // The Black Templars may not take the Codex Impulsor, but their own — the one with
    // their keyword — is theirs to take.
    const restrictions = { excludedNames: new Map([['impulsor', 'black templars']]), excludedKeywords: new Set<string>() }
    const units = [
      { entryId: 'codex', name: 'Impulsor', keywords: ['Vehicle', 'Faction: Adeptus Astartes'], toughness: 10, warlord: false },
      { entryId: 'own', name: 'Impulsor', keywords: ['Vehicle', 'Faction: Black Templars'], toughness: 10, warlord: false },
    ]
    expect(factionRestrictionViolations(restrictions, units).map((error) => error.entryId)).toEqual(['codex'])
  })
})

describe('King of the Colosseum army construction', () => {
  const unit = (entryId: string, keywords: string[], toughness: number, warlord = false) => ({
    entryId,
    name: entryId,
    keywords,
    toughness,
    warlord,
  })

  it('accepts a legal prototype roster', () => {
    expect(
      kotcViolations(1, [
        unit('leader', ['Infantry', 'Character'], 4, true),
        unit('troops', ['Infantry', 'Battleline'], 4),
        unit('tank', ['Vehicle'], 9),
      ]),
    ).toEqual([])
  })

  it('reports every KOTC-specific restriction without guessing unknown toughness', () => {
    const errors = kotcViolations(2, [
      unit('hero', ['Infantry', 'Epic Hero'], 10),
      unit('tank', ['Vehicle'], 9),
      unit('tank', ['Vehicle'], 9),
    ])
    expect(errors.map((error) => error.message)).toEqual([
      'needs exactly 1 detachment, has 2',
      'needs at least 2 Infantry units',
      'needs a Warlord',
      'does not allow Epic Heroes',
      'does not allow Toughness 10',
      'allows at most 1 Toughness 9 unit, has 2',
      'allows at most 1 of this datasheet, has 2',
    ])
  })
})

/**
 * Some community catalogues cap an entry at fewer than their own squad composition
 * puts in the squad. A player given no choice in the matter should not be shown that
 * as their mistake.
 */
describe('a limit the catalogue breaks itself', () => {
  const composed = new Map([['exchange-rifle', 'Decimus Kill Team']])

  it('is not the player’s to answer for when the catalogue built the unit', () => {
    expect(isCatalogueSelfContradiction({ entryId: 'exchange-rifle', message: 'allows at most 1, has 2' }, composed)).toBe(true)
  })

  it('still counts against a unit the player composed', () => {
    expect(isCatalogueSelfContradiction({ entryId: 'sternguard-rifle', message: 'allows at most 9, has 10' }, composed)).toBe(false)
  })

  it('leaves every other kind of complaint alone', () => {
    expect(isCatalogueSelfContradiction({ entryId: 'exchange-rifle', message: 'needs at least 1, has 0' }, composed)).toBe(false)
  })

  /**
   * The map holds what the catalogue puts in a unit by itself. An enhancement the
   * player chose is inside that unit too, and one relic in two armies' worth of
   * characters is theirs to answer for, so it must never be in the map to begin with.
   */
  it('still counts against an enhancement the player chose', () => {
    expect(isCatalogueSelfContradiction({ entryId: 'destroyer-ankh', message: 'allows at most 1, has 2' }, composed)).toBe(false)
  })
})

/** The roster card and the loadout panel answer the same question, so the card counts the model kinds. */
describe('what a unit is carrying', () => {
  const kind = (over: Partial<Parameters<typeof heldWargear>[0][number]>) => ({
    name: 'Veteran',
    fixed: [],
    members: [{ id: 'veteran', choiceKey: null, baseCount: 0 }],
    rows: [],
    ...over,
  })

  it('gives every model of a kind what that kind always carries', () => {
    const models = [kind({ fixed: [{ name: 'Bolt pistol' }], members: [{ id: 'veteran', choiceKey: null, baseCount: 4 }] })]
    expect(heldWargear(models, [], [])).toEqual([{ name: 'Bolt pistol', count: 4 }])
  })

  it('counts a choosable weapon as the squad divided it', () => {
    const models = [kind({ rows: [{ name: 'Combi-weapon', choiceKey: 'models', optionId: 'combi' }] })]
    const choices = [{ key: 'models', options: [{ id: 'combi', count: 3 }] }]
    expect(heldWargear(models, choices, [])).toEqual([{ name: 'Combi-weapon', count: 3 }])
  })

  it('adds the same weapon selected through more than one choice', () => {
    const models = [
      kind({
        rows: [
          {
            name: 'Accursed weapon',
            choiceKey: 'pistol',
            optionId: 'pistol-accursed',
            alternatives: [{ choiceKey: 'bolter', optionId: 'bolter-accursed' }],
          },
        ],
      }),
    ]
    const choices = [
      { key: 'pistol', options: [{ id: 'pistol-accursed', count: 1 }] },
      { key: 'bolter', options: [{ id: 'bolter-accursed', count: 1 }] },
    ]

    expect(heldWargear(models, choices, [])).toEqual([{ name: 'Accursed weapon', count: 2 }])
  })

  it('adds up one weapon carried by more than one kind of model', () => {
    const models = [
      kind({ name: 'Veteran', fixed: [{ name: 'Bolt pistol' }], members: [{ id: 'veteran', choiceKey: null, baseCount: 4 }] }),
      kind({ name: 'Sergeant', fixed: [{ name: 'Bolt pistol' }], members: [{ id: 'sergeant', choiceKey: null, baseCount: 1 }] }),
    ]
    expect(heldWargear(models, [], [])).toEqual([{ name: 'Bolt pistol', count: 5 }])
  })

  it('keeps what the kinds never mention, such as an enhancement', () => {
    const models = [kind({ fixed: [{ name: 'Bolt pistol' }], members: [{ id: 'veteran', choiceKey: null, baseCount: 1 }] })]
    expect(
      heldWargear(
        models,
        [],
        [
          { name: 'Bolt pistol', count: 1 },
          { name: 'Artificer Armour', count: 1 },
        ],
      ),
    ).toEqual([
      { name: 'Bolt pistol', count: 1 },
      { name: 'Artificer Armour', count: 1 },
    ])
  })

  it('includes selected nested wargear that shares a name with a model row', () => {
    const models = [
      kind({
        rows: [{ name: 'Power fist', choiceKey: 'models', optionId: 'terminator' }],
      }),
    ]
    const choices = [
      { key: 'models', options: [{ id: 'terminator', count: 3 }] },
      { key: 'sergeant-weapon', options: [{ id: 'fist', name: 'Power fist', count: 1 }] },
    ]

    expect(heldWargear(models, choices, [{ name: 'Power fist', count: 4 }])).toEqual([{ name: 'Power fist', count: 4 }])
  })

  it('does not restore catalogue defaults that the drawn models replaced', () => {
    const models = [
      kind({
        fixed: [{ name: 'Plague knives' }],
        members: [{ id: 'specialist', choiceKey: 'models', baseCount: 0 }],
        rows: [{ name: 'Boltgun', choiceKey: 'guns', optionId: 'boltgun' }],
      }),
    ]
    const choices = [
      { key: 'models', options: [{ id: 'specialist', count: 4 }] },
      { key: 'guns', options: [{ id: 'boltgun', count: 0 }] },
    ]

    expect(
      heldWargear(models, choices, [
        { name: 'Plague knives', count: 5 },
        { name: 'Boltgun', count: 1 },
      ]),
    ).toEqual([{ name: 'Plague knives', count: 4 }])
  })

  it('does not count a fixed-size composition choice as extra wargear', () => {
    const models = [kind({ fixed: [{ name: 'Heavy thunder hammer' }], members: [{ id: 'veteran', choiceKey: null, baseCount: 1 }] })]
    const choices = [
      {
        key: 'composition',
        name: 'Unit composition',
        options: [{ id: 'five-models', count: 1, pieceCounts: [{ name: 'Heavy thunder hammer', count: 1 }] }],
      },
    ]

    expect(heldWargear(models, choices, [{ name: 'Heavy thunder hammer', count: 1 }])).toEqual([{ name: 'Heavy thunder hammer', count: 1 }])
  })

  it('counts the pieces selected by one composite model row', () => {
    const models = [
      kind({
        rows: [
          {
            name: 'Power weapon and Astartes shield',
            choiceKey: 'weapon',
            optionId: 'sword-and-shield',
            pieces: ['Power weapon', 'Astartes shield'],
          },
        ],
      }),
    ]
    const choices = [{ key: 'weapon', options: [{ id: 'sword-and-shield', count: 1 }] }]

    expect(heldWargear(models, choices, [])).toEqual([
      { name: 'Power weapon', count: 1 },
      { name: 'Astartes shield', count: 1 },
    ])
  })

  it('falls back to the catalogue for a unit with no kinds at all', () => {
    expect(heldWargear([], [], [{ name: 'Relic blade', count: 1 }])).toEqual([{ name: 'Relic blade', count: 1 }])
  })
})
