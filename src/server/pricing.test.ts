import { describe, expect, it } from 'vitest'
import {
  deploymentRules,
  heldWargear,
  isCatalogueSelfContradiction,
  factionRestrictionViolations,
  findEnhancementDescription,
  kotcViolations,
  resolveDisposition,
  uniqueNames,
} from './pricing'
import { descriptionKey } from './wahapedia'

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
})

describe('enhancement descriptions', () => {
  it('lists an enhancement once when the choice and built wargear both contain it', () => {
    expect(uniqueNames(['Demanding Leader', 'Demanding Leader'])).toEqual(['Demanding Leader'])
  })

  it('matches a minor detachment name correction', () => {
    const descriptions = new Map([[descriptionKey('Brood Brother Auxilia', 'Martial Espionage'), 'Exploit weak points.']])

    expect(findEnhancementDescription(descriptions, [{ name: 'Brood Brothers Auxilia' }], 'Martial Espionage')).toBe('Exploit weak points.')
  })

  it('matches an aura suffix supplied by the rules source', () => {
    const descriptions = new Map([[descriptionKey('Awakened Dynasty', 'Phasal Subjugator (Aura)'), 'Improve nearby attacks.']])

    expect(findEnhancementDescription(descriptions, [{ name: 'Awakened Dynasty' }], 'Phasal Subjugator')).toBe('Improve nearby attacks.')
  })

  it('matches a minor name correction within the selected detachment', () => {
    const descriptions = new Map([
      [descriptionKey('Cursed Legion', 'Mask of the Nekrosor'), 'Each time this unit attacks, add 1 to the Hit roll.'],
    ])

    expect(findEnhancementDescription(descriptions, [{ name: 'Cursed Legion' }], 'Mark of the Nekrosor')).toBe(
      'Each time this unit attacks, add 1 to the Hit roll.',
    )
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
    const restrictions = { excludedNames: new Set(['scout squad']), excludedKeywords: new Set(['psyker']) }
    const units = [
      { entryId: 'scouts', name: 'Scout Squad', keywords: ['Infantry'], toughness: 4, warlord: false },
      { entryId: 'librarian', name: 'Librarian', keywords: ['Character', 'Psyker'], toughness: 4, warlord: false },
    ]
    expect(factionRestrictionViolations(restrictions, units).map((error) => error.entryId)).toEqual(['scouts', 'librarian'])
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
})

/**
 * The roster card and the loadout panel answer the same question, so the card counts
 * the model kinds rather than the catalogue's own selection — which knows nothing
 * about the swaps a datasheet allows for free.
 */
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

  it('follows a free swap, naming what is taken and not what is given up', () => {
    const models = [
      kind({
        fixed: [{ name: 'Heavy thunder hammer', count: 1 }],
        members: [{ id: 'veteran', choiceKey: null, baseCount: 2 }],
        swaps: [
          { key: 'shield#0', gives: ['Heavy thunder hammer'], takes: ['Power weapon', 'Astartes shield'], count: 1, max: 1, free: true },
        ],
      }),
    ]
    expect(heldWargear(models, [], [{ name: 'Heavy thunder hammer', count: 2 }])).toEqual([
      { name: 'Heavy thunder hammer', count: 1 },
      { name: 'Power weapon', count: 1 },
      { name: 'Astartes shield', count: 1 },
    ])
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

  it('leaves a weapon out once a swap has taken the last of it', () => {
    const models = [
      kind({
        fixed: [{ name: 'Infernus heavy bolter', count: 0 }],
        members: [{ id: 'veteran', choiceKey: null, baseCount: 1 }],
        swaps: [{ key: 'frag#0', gives: ['Infernus heavy bolter'], takes: ['Frag cannon'], count: 1, max: 1, free: true }],
      }),
    ]
    expect(heldWargear(models, [], [{ name: 'Infernus heavy bolter', count: 1 }])).toEqual([{ name: 'Frag cannon', count: 1 }])
  })

  it('falls back to the catalogue for a unit with no kinds at all', () => {
    expect(heldWargear([], [], [{ name: 'Relic blade', count: 1 }])).toEqual([{ name: 'Relic blade', count: 1 }])
  })
})
