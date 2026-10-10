import { describe, expect, it } from 'vitest'
import type { OptionalRuleId } from '../core/battle'
import type { SelectionEntry } from '../core/catalogue'
import {
  calculateRosterAssessment,
  calculateRosterPrice,
  calculateRosterTotals,
  choiceOptionsForPricing,
  deploymentRules,
  heldWargear,
  isCatalogueSelfContradiction,
  factionRestrictionViolations,
  findEnhancementDescription,
  grantsStrategicReserveExemption,
  kotcViolations,
  savedRosterPriceInput,
  resolveDisposition,
  strategicReserveExemptionSelectors,
  uniqueNames,
} from '../shared/pricing'
import { descriptionKey } from './datacards'
import { bookOf, enhancement, points as pointsCost, shelfOf } from './catalogue.fixtures'
import type { LoadedRules } from './rules'

const cappedLord = (id: string, name: string) => ({
  id,
  name,
  type: 'unit' as const,
  selectionEntries: [
    {
      id: `${id}-body`,
      name,
      type: 'model' as const,
      costs: pointsCost(100),
      constraints: [
        { id: `${id}-body-min`, type: 'min' as const, value: 1, field: 'selections', scope: 'parent' },
        { id: `${id}-body-max`, type: 'max' as const, value: 1, field: 'selections', scope: 'parent' },
      ],
    },
  ],
  constraints: [{ id: `${id}-max`, type: 'max' as const, value: 3, field: 'selections', scope: 'force', includeChildSelections: true }],
  modifiers: [
    {
      type: 'set' as const,
      field: `${id}-max`,
      value: 2,
      conditions: [{ type: 'atLeast' as const, value: 1, field: 'selections', scope: 'force', childId: 'incursion', shared: true }],
    },
  ],
})

const rulesWithout = {
  factionKeys: new Map(),
  detachmentReferences: new Map(),
  detachmentDetails: new Map(),
  factionRestrictions: new Map(),
} as Partial<LoadedRules> as LoadedRules

it('prices a saved fixed composition after resizing its equipped models', () => {
  const loaded = bookOf({
    selectionEntries: [
      {
        id: 'squad',
        name: 'Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'composition',
            name: 'Unit Composition',
            defaultSelectionEntryId: 'size-2',
            constraints: [
              { id: 'composition-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'composition-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [2, 3].map((count) => ({
              id: `size-${count}`,
              name: `${count} models`,
              type: 'upgrade',
              costs: pointsCost(count * 90),
              selectionEntries: [
                {
                  id: `body-${count}`,
                  name: 'Body',
                  type: 'model',
                  collective: true,
                  constraints: [
                    { id: `body-${count}-min`, type: 'min', value: count, field: 'selections', scope: 'parent' },
                    { id: `body-${count}-max`, type: 'max', value: count, field: 'selections', scope: 'parent' },
                  ],
                  selectionEntryGroups: [
                    {
                      id: `weapons-${count}`,
                      name: 'Weapons',
                      defaultSelectionEntryId: `spear-${count}`,
                      constraints: [
                        { id: `weapons-${count}-min`, type: 'min', value: 1, field: 'selections', scope: 'parent' },
                        { id: `weapons-${count}-max`, type: 'max', value: 1, field: 'selections', scope: 'parent' },
                      ],
                      selectionEntries: ['spear', 'axe'].map((name) => ({
                        id: `${name}-${count}`,
                        name,
                        type: 'upgrade',
                        collective: true,
                      })),
                    },
                  ],
                },
              ],
            })),
          },
        ],
      },
    ],
  })
  const priced = calculateRosterPrice(
    {
      catalogueId: 'cat',
      detachmentIds: [],
      disposition: null,
      limit: 2000,
      units: [
        {
          entryId: 'squad',
          models: 3,
          choices: { composition: 'size-2' },
          spreads: { 'composition/size-2/body-2/weapons-2': { 'spear-2': 0, 'axe-2': 2 } },
        },
      ],
    },
    loaded,
    rulesWithout,
  )
  expect(priced).toMatchObject({ points: 270, errors: [] })
})

it('marks a saved datasheet missing from the new source as illegal', () => {
  const loaded = bookOf({ selectionEntries: [{ id: 'current', name: 'Current unit', type: 'model', costs: pointsCost(50) }] })
  const priced = calculateRosterPrice(
    { catalogueId: 'cat', detachmentIds: [], disposition: null, limit: 2_000, units: [{ entryId: 'retired' }] },
    loaded,
    rulesWithout,
  )
  expect(priced?.errors).toContainEqual({
    entryId: 'retired',
    entryName: 'retired',
    message: 'this saved datasheet is no longer available; choose a current unit',
  })
})

it('marks an old selected wargear option as illegal instead of silently dropping it', () => {
  const loaded = bookOf({ selectionEntries: [{ id: 'current', name: 'Current unit', type: 'model', costs: pointsCost(50) }] })
  const priced = calculateRosterPrice(
    { catalogueId: 'cat', detachmentIds: [], disposition: null, limit: 2_000, units: [{ entryId: 'current', choices: { old: 'weapon' } }] },
    loaded,
    rulesWithout,
  )
  expect(priced?.errors).toContainEqual({
    entryId: 'current',
    entryName: 'Current unit',
    message: 'a saved choice is no longer available; reselect this unit’s options',
  })
})

describe('the enhancements an army may hold', () => {
  const bearer = (id: string, name: string) => ({
    id,
    name,
    type: 'model' as const,
    costs: pointsCost(80),
    selectionEntries: [
      {
        id: `${id}-relic`,
        name: `${name}'s relic`,
        type: 'upgrade' as const,
        costs: enhancement(),
        constraints: [{ id: `${id}-relic-min`, type: 'min' as const, value: 1, field: 'selections', scope: 'parent' }],
      },
    ],
  })
  const loaded = bookOf({
    selectionEntries: ['one', 'two', 'three', 'four', 'five'].map((word, at) => bearer(`lord-${at}`, `Lord ${word}`)),
  })
  const errorsFor = (bearers: number, limit: number) =>
    calculateRosterPrice(
      {
        catalogueId: 'cat',
        detachmentIds: [],
        disposition: null,
        limit,
        units: Array.from({ length: bearers }, (_, at) => ({ entryId: `lord-${at}` })),
      },
      loaded,
      rulesWithout,
    )?.errors.map((error) => error.message)

  it('is two in an Incursion army', () => {
    expect([errorsFor(2, 1_000), errorsFor(3, 1_000)]).toEqual([[], ['allow at most 2 in an army, has 3']])
  })

  it('is four in a Strike Force army', () => {
    expect([errorsFor(4, 2_000), errorsFor(5, 2_000)]).toEqual([[], ['allow at most 4 in an army, has 5']])
  })
})

describe('a datasheet capped by the battle size', () => {
  const priceCopies = (loaded: ReturnType<typeof bookOf>, limit: number, units: { entryId: string; catalogueId?: string }[]) =>
    calculateRosterPrice({ catalogueId: 'cat', detachmentIds: [], disposition: null, limit, units }, loaded, rulesWithout)?.errors.map(
      (error) => error.message,
    )

  it('allows the smaller game fewer copies than the larger one', () => {
    const loaded = bookOf({ selectionEntries: [cappedLord('lord', 'Warlord')] })
    const three = [{ entryId: 'lord' }, { entryId: 'lord' }, { entryId: 'lord' }]

    expect(priceCopies(loaded, 2_000, three)).toEqual([])
    expect(priceCopies(loaded, 1_000, three)).toEqual(['allows at most 2, has 3'])
  })

  it('reports a cap written on the datasheet category', () => {
    const loaded = bookOf({
      categoryEntries: [
        {
          id: 'lord-category',
          name: 'Warlord',
          constraints: [{ id: 'lord-category-max', type: 'max', value: 3, field: 'selections', scope: 'force' }],
          modifiers: [
            {
              type: 'set',
              field: 'lord-category-max',
              value: 1,
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'force', childId: 'incursion' }],
            },
          ],
        },
      ],
      selectionEntries: [{ id: 'lord', name: 'Warlord', type: 'unit', categoryLinks: [{ id: 'lord-link', targetId: 'lord-category' }] }],
    })
    const three = [{ entryId: 'lord' }, { entryId: 'lord' }, { entryId: 'lord' }]

    expect(priceCopies(loaded, 1_000, three)).toEqual(['allows at most 1, has 3'])
  })

  it('keeps cached unit builds scoped to their battle size', () => {
    const loaded = bookOf({ selectionEntries: [cappedLord('lord', 'Warlord')] })
    const units = [{ entryId: 'lord' }, { entryId: 'lord' }, { entryId: 'lord' }]
    const cache: NonNullable<Parameters<typeof calculateRosterAssessment>[3]> = new Map()
    const assess = (limit: number) =>
      calculateRosterAssessment({ catalogueId: 'cat', detachmentIds: [], disposition: null, limit, units }, loaded, rulesWithout, cache)

    assess(2_000)
    expect(assess(1_000)?.errors.map((error) => error.message)).toEqual(['allows at most 2, has 3'])
  })

  it('caps an ally in its own force by the same battle size', () => {
    // An allied book is a force of its own, and a force that is not told the battle
    // size reads the largest game's cap.
    const loaded = shelfOf({ selectionEntries: [cappedLord('lord', 'Warlord')] }, { selectionEntries: [cappedLord('ally', 'Ally')] })
    const three = [
      { entryId: 'ally', catalogueId: 'cat-1' },
      { entryId: 'ally', catalogueId: 'cat-1' },
      { entryId: 'ally', catalogueId: 'cat-1' },
    ]

    expect(priceCopies(loaded, 2_000, three)).toEqual([])
    expect(priceCopies(loaded, 1_000, three)).toEqual(['allows at most 2, has 3'])
  })
})

describe('a limit the catalogue breaks inside a unit', () => {
  // A composed unit holding two of something capped at one is the catalogue
  // contradicting itself; four of that unit where the roster may hold three is the
  // player, and the two must not be silenced together.
  const loaded = bookOf({
    selectionEntries: [
      {
        id: 'kill-team',
        name: 'Kill Team',
        type: 'unit',
        costs: pointsCost(100),
        constraints: [{ id: 'team-max', type: 'max', value: 3, field: 'selections', scope: 'force', includeChildSelections: true }],
        selectionEntries: [
          {
            id: 'rifle',
            name: 'Exchange rifle',
            type: 'upgrade',
            constraints: [
              { id: 'rifle-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
              { id: 'rifle-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
            ],
          },
        ],
      },
    ],
  })
  const errorsFor = (copies: number) =>
    calculateRosterPrice(
      {
        catalogueId: 'cat',
        detachmentIds: [],
        disposition: null,
        limit: 2_000,
        units: Array.from({ length: copies }, () => ({ entryId: 'kill-team' })),
      },
      loaded,
      rulesWithout,
    )?.errors.map((error) => error.message)

  it('says nothing about the composition the player did not choose', () => {
    expect(errorsFor(1)).toEqual([])
  })

  it('still reports how many of the datasheet the roster may hold', () => {
    expect(errorsFor(4)).toEqual(['allows at most 3, has 4'])
  })
})

describe('force disposition', () => {
  it('does not price a saved roster with a detachment no longer offered by its faction as legal', () => {
    const loaded = bookOf({ selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] })

    expect(
      calculateRosterPrice(
        { catalogueId: 'cat', detachmentIds: ['retired-detachment'], disposition: null, limit: 2_000, units: [] },
        loaded,
        rulesWithout,
      )?.detachmentError,
    ).toBe('This roster has a detachment that is no longer available. Choose a current detachment.')
  })

  it('does not price a saved roster from a replaced faction as legal', () => {
    const loaded = bookOf({ selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] })
    loaded.factions = []

    expect(
      calculateRosterPrice({ catalogueId: 'cat', detachmentIds: [], disposition: null, limit: 2_000, units: [] }, loaded, rulesWithout)
        ?.detachmentError,
    ).toBe('This roster uses a replaced faction catalogue. Choose a current faction and detachment.')
  })

  it('prices profiled detachments from their catalogue DP costs', () => {
    const loaded = bookOf({
      name: 'Space Marines',
      selectionEntries: [{ id: 'intercessors', name: 'Intercessors', type: 'unit' }],
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
                { id: 'one', name: 'First', type: 'upgrade', costs: [{ name: 'Detachment Points', typeId: 'dp', value: 1 }] },
                { id: 'three', name: 'Second', type: 'upgrade', costs: [{ name: 'Detachment Points', typeId: 'dp', value: 3 }] },
              ],
            },
          ],
        },
      ],
    })
    loaded.index.costTypes.set('dp', { id: 'dp', name: 'Detachment Points' })
    expect(
      calculateRosterPrice(
        { catalogueId: 'cat', detachmentIds: ['one', 'three'], disposition: null, limit: 2_000, units: [] },
        loaded,
        rulesWithout,
      ),
    ).toMatchObject({ detachmentPointsSpent: 4, detachmentPointsOver: true })
  })

  it('prices a parent detachment offered to a chapter from its catalogue', () => {
    const detachment = (id: string, name: string, cost: number) => ({
      id,
      name,
      type: 'upgrade' as const,
      costs: [{ name: 'Detachment Points', typeId: 'dp', value: cost }],
      categoryLinks: [{ id: `${id}-disposition`, name: 'Take and Hold', targetId: 'take-and-hold' }],
    })
    const wrapper = (id: string, option: ReturnType<typeof detachment>) => ({
      id: `${id}-wrapper`,
      name: 'Detachment',
      type: 'upgrade' as const,
      selectionEntryGroups: [{ id: `${id}-choices`, name: 'Detachment', selectionEntries: [option] }],
    })
    const loaded = shelfOf(
      {
        name: 'Dark Angels',
        selectionEntries: [{ id: 'lion', name: "Lion El'Jonson", type: 'unit' }],
        sharedSelectionEntries: [wrapper('current', detachment('wrath', 'Wrath of the Rock', 2))],
      },
      {
        name: 'Space Marines',
        selectionEntries: [{ id: 'intercessors', name: 'Intercessors', type: 'unit' }],
        sharedSelectionEntries: [wrapper('parent', detachment('assault', 'Assault Brethren', 1))],
      },
    )
    loaded.index.costTypes.set('dp', { id: 'dp', name: 'Detachment Points' })
    const inherited = loaded.detachments.get('cat-1')!.options[0]!
    loaded.detachments.get('cat')!.options.push(inherited)

    expect(
      calculateRosterPrice(
        { catalogueId: 'cat', detachmentIds: ['assault'], disposition: null, limit: 2_000, units: [] },
        loaded,
        rulesWithout,
      ),
    ).toMatchObject({
      detachments: [{ name: 'Assault Brethren', points: 1 }],
      detachmentPointsSpent: 1,
      disposition: 'take-and-hold',
    })
  })

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
  it('lists a selected detachment upgrade on its unit', () => {
    const loaded = bookOf({
      selectionEntries: [
        {
          id: 'detachment',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'detachments',
              name: 'Detachment',
              selectionEntries: [{ id: 'assault', name: 'Assault Brethren', type: 'upgrade' }],
            },
          ],
        },
        {
          id: 'jump-packs',
          name: 'Assault Intercessors with Jump Packs',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'upgrades',
              name: 'Assault Brethren Upgrades',
              constraints: [{ id: 'upgrade-max', field: 'selections', scope: 'self', type: 'max', value: 1 }],
              selectionEntries: [{ id: 'furious', name: 'Furious Assault', type: 'upgrade', costs: pointsCost(10) }],
            },
          ],
        },
      ],
    })
    const rules = {
      factionKeys: new Map([['test-catalogue', 'test-catalogue']]),
      factionRestrictions: new Map(),
      detachmentReferences: new Map(),
      detachmentDetails: new Map([
        [
          'test-catalogue',
          new Map([
            [
              'assault-brethren',
              {
                id: 'assault-brethren',
                name: 'Assault Brethren',
                points: 1,
                dispositions: [],
                rules: [],
                enhancements: [],
                upgrades: [
                  { name: 'Furious Assault', points: 10, description: 'Charge harder.', eligibility: { anyOf: [[]], excluded: [] } },
                ],
                stratagems: [],
              },
            ],
          ]),
        ],
      ]),
    } as Partial<LoadedRules> as LoadedRules

    const unit = calculateRosterPrice(
      {
        catalogueId: 'cat',
        detachmentIds: ['assault'],
        disposition: null,
        limit: 2000,
        units: [{ entryId: 'jump-packs', choices: { upgrades: 'furious' } }],
      },
      loaded,
      rules,
    )?.units[0]
    expect({ upgrades: unit?.upgrades, kind: unit?.choices.find((choice) => choice.key === 'upgrades')?.kind }).toEqual({
      upgrades: ['Furious Assault'],
      kind: 'upgrade',
    })
  })

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
  const detachmentBook = (...units: SelectionEntry[]) =>
    bookOf({
      name: 'Orks',
      categoryEntries: [
        { id: 'orks', name: 'Faction: Orks' },
        { id: 'aircraft', name: 'Aircraft' },
      ],
      sharedSelectionEntries: [
        {
          id: 'detachment',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'detachments',
              name: 'Detachment',
              selectionEntries: [{ id: 'flyboyz', name: 'Flyboyz', type: 'upgrade' }],
            },
          ],
        },
      ],
      selectionEntries: units,
    })
  const flyboyzRules = (
    enhancements: { name: string; points: number; description: string; eligibility: { anyOf: string[][]; excluded: string[] } }[] = [],
  ) =>
    ({
      factionKeys: new Map([['orks', 'orks']]),
      detachmentReferences: new Map([
        ['orks', new Map([['flyboyz', { enhancements: enhancements.length, upgrades: 0, stratagems: 0, points: 1, dispositions: [] }]])],
      ]),
      detachmentDetails: new Map([
        [
          'orks',
          new Map([
            [
              'flyboyz',
              {
                id: 'flyboyz',
                name: 'Flyboyz',
                points: 1,
                dispositions: [],
                rules: [
                  {
                    name: 'Air Superiority',
                    description:
                      'Friendly **Orks Aircraft** units do not count towards the combined points value of your **Strategic Reserves** units.',
                  },
                ],
                enhancements,
                upgrades: [],
                stratagems: [],
              },
            ],
          ]),
        ],
      ]),
      factionRestrictions: new Map(),
    }) as Partial<LoadedRules> as LoadedRules

  it('derives every supported pre-battle option from ability names', () => {
    expect(deploymentRules(['Deep Strike', 'Infiltrators', 'Scouts 6"'])).toEqual({
      formationOptions: ['deep-strike'],
      prebattleRules: ['infiltrators', 'scouts'],
    })
  })

  it('does not invent deployment options without matching abilities', () => {
    expect(deploymentRules(['Leader', 'Stealth'])).toEqual({ formationOptions: [], prebattleRules: [] })
  })

  it('reads reserve-limit exemptions from detachment rules and enhancements', () => {
    expect(
      strategicReserveExemptionSelectors([
        '- Friendly **Orks Aircraft** units do not count towards the combined points value of your **strategic reserves** units.',
      ]),
    ).toEqual(['Orks Aircraft'])
    expect(
      grantsStrategicReserveExemption(
        "If the bearer's unit starts the battle in Strategic Reserves, its points value does not count towards the combined points limit for units from your army that are in Strategic Reserve.",
      ),
    ).toBe(true)
    expect(grantsStrategicReserveExemption('This unit can be set up in Strategic Reserves.')).toBe(false)
  })

  it('marks a unit matching a compound detachment keyword exemption', () => {
    const loaded = detachmentBook({
      id: 'dakkajet',
      name: 'Dakkajet',
      type: 'unit',
      costs: pointsCost(135),
      categoryLinks: [
        { id: 'orks-link', targetId: 'orks' },
        { id: 'aircraft-link', targetId: 'aircraft' },
      ],
    })

    const priced = calculateRosterPrice(
      { catalogueId: 'cat', detachmentIds: ['flyboyz'], disposition: null, limit: 2_000, units: [{ entryId: 'dakkajet' }] },
      loaded,
      flyboyzRules(),
    )

    expect(priced).toMatchObject({
      strategicReserveFactsComplete: true,
      units: [expect.objectContaining({ name: 'Dakkajet', strategicReserveExempt: true })],
    })
  })

  it('does not treat a selected detachment without joined rules detail as complete', () => {
    const loaded = detachmentBook({ id: 'dakkajet', name: 'Dakkajet', type: 'unit', costs: pointsCost(135) })
    const rules = { ...flyboyzRules(), detachmentDetails: new Map() }

    const priced = calculateRosterPrice(
      { catalogueId: 'cat', detachmentIds: ['flyboyz'], disposition: null, limit: 2_000, units: [{ entryId: 'dakkajet' }] },
      loaded,
      rules,
    )

    expect(priced?.strategicReserveFactsComplete).toBe(false)
  })

  it('does not treat a selected detachment with a missing enhancement description as complete', () => {
    const loaded = detachmentBook({ id: 'warboss', name: 'Warboss', type: 'unit', costs: pointsCost(75) })
    const rules = flyboyzRules([
      {
        name: 'Master of Manoeuvre',
        points: 30,
        description: '',
        eligibility: { anyOf: [[]], excluded: [] },
      },
    ])

    const priced = calculateRosterPrice(
      { catalogueId: 'cat', detachmentIds: ['flyboyz'], disposition: null, limit: 2_000, units: [{ entryId: 'warboss' }] },
      loaded,
      rules,
    )

    expect(priced?.strategicReserveFactsComplete).toBe(false)
  })

  it('marks the unit carrying a selected reserve-limit enhancement', () => {
    const loaded = detachmentBook(
      {
        id: 'warboss',
        name: 'Warboss',
        type: 'unit',
        costs: pointsCost(75),
        selectionEntryGroups: [
          {
            id: 'enhancements',
            name: 'Enhancements',
            constraints: [{ id: 'enhancements-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
            selectionEntries: [{ id: 'master', name: 'Master of Manoeuvre', type: 'upgrade', costs: enhancement() }],
          },
        ],
      },
      { id: 'boyz', name: 'Boyz', type: 'unit', costs: pointsCost(80) },
    )
    const rules = flyboyzRules([
      {
        name: 'Master of Manoeuvre',
        points: 30,
        description:
          "If the bearer's unit starts the battle in Strategic Reserves, its points value does not count towards the combined points limit for units from your army that are in Strategic Reserve.",
        eligibility: { anyOf: [[]], excluded: [] },
      },
    ])

    const input = {
      catalogueId: 'cat',
      detachmentIds: ['flyboyz'],
      disposition: null,
      limit: 2_000,
      units: [{ entryId: 'warboss', choices: { enhancements: 'master' } }, { entryId: 'boyz' }],
    }
    const priced = calculateRosterPrice(input, loaded, rules)
    const assessed = calculateRosterAssessment(input, loaded, rules)

    expect(priced).toMatchObject({
      strategicReserveFactsComplete: true,
      units: [
        expect.objectContaining({ name: 'Warboss', enhancements: ['Master of Manoeuvre'], strategicReserveExempt: true }),
        expect.objectContaining({ name: 'Boyz', enhancements: [] }),
      ],
    })
    expect(priced?.units[1]).not.toHaveProperty('strategicReserveExempt')
    expect(assessed?.units).toEqual(
      priced?.units.map(({ key, size, enhancements, upgrades }) => ({ key, size: { models: size.models }, enhancements, upgrades })),
    )
  })

  it('uses MFM enhancement points in the option, roster, assessment, and saved total', () => {
    const loaded = detachmentBook({
      id: 'warboss',
      name: 'Warboss',
      type: 'unit',
      costs: pointsCost(75),
      selectionEntryGroups: [
        {
          id: 'enhancements',
          name: 'Enhancements',
          constraints: [{ id: 'enhancements-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
          selectionEntries: [{ id: 'master', name: 'Master of Manoeuvre', type: 'upgrade', costs: pointsCost(20) }],
        },
      ],
    })
    loaded.mfm = new Map([
      [
        'orks',
        {
          slug: 'orks',
          version: '1.5',
          units: [],
          detachments: [{ name: 'Flyboyz', dp: 2, enhancements: [{ name: 'Master of Manoeuvre', points: 15 }] }],
        },
      ],
    ])
    const saved = {
      catalogueId: 'cat',
      detachmentIds: ['flyboyz'],
      disposition: null,
      limit: 2_000,
      picks: [{ entryId: 'warboss', choices: { enhancements: 'master' } }],
    }
    const input = savedRosterPriceInput(saved)
    const priced = calculateRosterPrice(
      input,
      loaded,
      flyboyzRules([{ name: 'Master of Manoeuvre', points: 20, description: 'Test', eligibility: { anyOf: [[]], excluded: [] } }]),
    )
    expect({
      option: priced?.units[0]?.choices.find((choice) => choice.name === 'Enhancements')?.options[0]?.points,
      unit: priced?.units[0]?.points,
      roster: priced?.points,
      assessment: calculateRosterAssessment(input, loaded, null)?.points,
      savedTotal: calculateRosterTotals(input, loaded, null)?.points,
    }).toEqual({ option: 15, unit: 90, roster: 90, assessment: 90, savedTotal: 90 })
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

  it('accepts a legal KOTC roster', () => {
    expect(
      kotcViolations(1, [
        unit('leader', ['Infantry', 'Character'], 4, true),
        unit('troops', ['Infantry', 'Battleline'], 4),
        unit('tank', ['Vehicle'], 9),
      ]),
    ).toEqual([])
  })

  it('requires exactly one Character Warlord', () => {
    const infantry = unit('infantry', ['Infantry'], 4)
    const character = unit('character', ['Infantry', 'Character'], 4)
    expect(kotcViolations(1, [{ ...infantry, warlord: true }, character]).map((error) => error.message)).toEqual([
      'Warlord must have the Character keyword',
    ])
    expect(
      kotcViolations(1, [
        { ...character, warlord: true },
        { ...infantry, warlord: true },
      ]).map((error) => error.message),
    ).toEqual(['needs exactly 1 Warlord, has 2', 'Warlord must have the Character keyword'])
  })

  it('does not count a toggle absent from the catalogue as a Warlord', () => {
    const loaded = bookOf({ selectionEntries: [cappedLord('lord', 'Lord')] })
    const price = calculateRosterPrice(
      {
        catalogueId: 'cat',
        detachmentIds: [],
        disposition: null,
        limit: 600,
        units: [{ entryId: 'lord', toggles: { invented: 1 } }],
      },
      loaded,
      rulesWithout,
    )
    expect(price?.errors.map((error) => error.message)).toContain('needs a Warlord')
  })

  it('refuses to pass a Toughness 9 unit whose enhancement could raise it', () => {
    const errors = kotcViolations(1, [
      { ...unit('leader', ['Infantry', 'Character'], 4, true), enhanced: true },
      unit('troops', ['Infantry', 'Battleline'], 4),
      { ...unit('tank', ['Vehicle'], 9), enhanced: true },
    ])
    expect(errors.map((error) => error.message)).toEqual(['is at the Toughness cap and cannot be verified once its enhancement is applied'])
  })

  it('names an attached leader as the reason a Toughness 9 unit cannot be verified', () => {
    const errors = kotcViolations(1, [
      unit('leader', ['Infantry', 'Character'], 4, true),
      unit('troops', ['Infantry', 'Battleline'], 4),
      { ...unit('tank', ['Vehicle'], 9), led: true },
    ])
    expect(errors.map((error) => error.message)).toEqual([
      'is at the Toughness cap and cannot be verified once its attached leader is applied',
    ])
  })

  it('leaves an unmodified Toughness 9 unit alone', () => {
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

  it('stops enforcing a restriction the roster has waived', () => {
    const army = [unit('hero', ['Infantry', 'Character', 'Epic Hero'], 4, true), unit('troops', ['Infantry', 'Battleline'], 4)]
    expect(kotcViolations(1, army).map((error) => error.message)).toEqual(['does not allow Epic Heroes'])
    expect(kotcViolations(1, army, 600, ['kotc-epic-heroes'])).toEqual([])
  })

  it('waives only the rule named, leaving the rest of the format intact', () => {
    const errors = kotcViolations(2, [unit('hero', ['Infantry', 'Epic Hero'], 10)], 600, ['kotc-toughness'])
    expect(errors.map((error) => error.message)).toEqual([
      'needs exactly 1 detachment, has 2',
      'needs at least 2 Infantry units',
      'needs a Warlord',
      'does not allow Epic Heroes',
    ])
  })

  it('says nothing about a Toughness the catalogue cannot state once the cap is waived', () => {
    const army = [
      { entryId: 'mystery', name: 'mystery', keywords: ['Infantry', 'Character'], toughness: null, warlord: true },
      unit('troops', ['Infantry', 'Battleline'], 4),
    ]
    expect(kotcViolations(1, army).map((error) => error.message)).toEqual(['cannot verify its Toughness from the synced catalogue'])
    expect(kotcViolations(1, army, 600, ['kotc-toughness'])).toEqual([])
  })

  it('lets a waived datasheet cap take as many copies as the catalogue allows', () => {
    const army = [
      unit('leader', ['Infantry', 'Character'], 4, true),
      unit('troops', ['Infantry'], 4),
      unit('troops', ['Infantry'], 4),
      unit('troops', ['Infantry'], 4),
    ]
    expect(kotcViolations(1, army).map((error) => error.message)).toEqual(['allows at most 1 of this datasheet, has 3'])
    expect(kotcViolations(1, army, 600, ['kotc-datasheet-copies'])).toEqual([])
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

  /**
   * A pairing a player takes by name is what opens a choice for each weapon in it, and
   * each of those is drawn as a row of its own below. The row below is where the count
   * comes from, and counting the pairing as well armed one Nob like two.
   */
  it('counts a weapon once when a pairing and the choice it opens both name it', () => {
    const models = [
      kind({
        name: 'Nob',
        members: [{ id: 'nob', choiceKey: null, baseCount: 1 }],
        rows: [
          {
            name: 'Kustom Choppa and Kombi-skorcha',
            choiceKey: 'nob/weapons',
            optionId: 'pairing',
            pieces: ['Kustom Choppa', 'Kombi-skorcha'],
          },
          { name: 'Kustom Choppa', choiceKey: 'nob/weapons/pairing/choppa', optionId: 'kustom-choppa' },
          { name: 'Power Klaw', choiceKey: 'nob/weapons/pairing/choppa', optionId: 'power-klaw' },
          { name: 'Kombi-skorcha', choiceKey: 'nob/weapons/pairing/skorcha', optionId: 'kombi-skorcha' },
        ],
      }),
    ]
    const choices = [
      { key: 'nob/weapons', options: [{ id: 'pairing', count: 1 }] },
      {
        key: 'nob/weapons/pairing/choppa',
        options: [
          { id: 'kustom-choppa', count: 1 },
          { id: 'power-klaw', count: 0 },
        ],
      },
      { key: 'nob/weapons/pairing/skorcha', options: [{ id: 'kombi-skorcha', count: 1 }] },
    ]

    expect(
      heldWargear(models, choices, [
        { name: 'Kustom Choppa', count: 1 },
        { name: 'Kombi-skorcha', count: 1 },
      ]),
    ).toEqual([
      { name: 'Kustom Choppa', count: 1 },
      { name: 'Kombi-skorcha', count: 1 },
    ])
  })

  it('takes the weapon the opened choice settled on rather than the pairing’s own name for it', () => {
    const models = [
      kind({
        name: 'Nob',
        members: [{ id: 'nob', choiceKey: null, baseCount: 1 }],
        rows: [
          {
            name: 'Kustom Choppa and Kombi-skorcha',
            choiceKey: 'nob/weapons',
            optionId: 'pairing',
            pieces: ['Kustom Choppa', 'Kombi-skorcha'],
          },
          { name: 'Kustom Choppa', choiceKey: 'nob/weapons/pairing/choppa', optionId: 'kustom-choppa' },
          { name: 'Power Klaw', choiceKey: 'nob/weapons/pairing/choppa', optionId: 'power-klaw' },
          { name: 'Kombi-skorcha', choiceKey: 'nob/weapons/pairing/skorcha', optionId: 'kombi-skorcha' },
        ],
      }),
    ]
    const choices = [
      { key: 'nob/weapons', options: [{ id: 'pairing', count: 1 }] },
      {
        key: 'nob/weapons/pairing/choppa',
        options: [
          { id: 'kustom-choppa', count: 0 },
          { id: 'power-klaw', count: 1 },
        ],
      },
      { key: 'nob/weapons/pairing/skorcha', options: [{ id: 'kombi-skorcha', count: 1 }] },
    ]

    expect(
      heldWargear(models, choices, [
        { name: 'Power Klaw', count: 1 },
        { name: 'Kombi-skorcha', count: 1 },
      ]),
    ).toEqual([
      { name: 'Power Klaw', count: 1 },
      { name: 'Kombi-skorcha', count: 1 },
    ])
  })

  it('falls back to the catalogue for a unit with no kinds at all', () => {
    expect(heldWargear([], [], [{ name: 'Relic blade', count: 1 }])).toEqual([{ name: 'Relic blade', count: 1 }])
  })
})

describe('saved roster price input', () => {
  const saved = {
    catalogueId: 'necrons',
    detachmentIds: ['skyshroud-spearhead'],
    disposition: 'priority-assets',
    limit: 600,
    picks: [],
    waivedRules: [],
    optionalRules: ['kotc-borrowed-disposition'] as OptionalRuleId[],
    borrowedDetachmentId: 'the-phaerons-armoury',
  }

  it('carries the borrow so the borrowed disposition stays allowed', () => {
    expect(savedRosterPriceInput(saved)).toMatchObject({
      disposition: 'priority-assets',
      borrowedDetachmentId: 'the-phaerons-armoury',
      optionalRules: ['kotc-borrowed-disposition'],
    })
  })

  it('defaults a list that borrows nothing to no borrow', () => {
    const { optionalRules: _rules, borrowedDetachmentId: _borrowed, ...plain } = saved
    expect(savedRosterPriceInput(plain)).toMatchObject({ borrowedDetachmentId: null, optionalRules: undefined })
  })
})

describe('the name an unnamed list falls back on', () => {
  const necrons = () =>
    bookOf({
      name: 'Necrons',
      selectionEntries: [
        { id: 'ctan', name: "C'tan Shard of the Nightbringer", type: 'unit', costs: pointsCost(330) },
        {
          id: 'hexmark',
          name: 'Hexmark Destroyer',
          type: 'unit',
          costs: pointsCost(90),
          selectionEntries: [{ id: 'warlord', name: 'Warlord', type: 'upgrade' }],
        },
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
              selectionEntries: [{ id: 'hypercrypt', name: 'Hypercrypt Legion', type: 'upgrade' }],
            },
          ],
        },
      ],
    })

  const priceOf = (units: { entryId: string; toggles?: Record<string, number> }[]) =>
    calculateRosterPrice({ catalogueId: 'cat', detachmentIds: ['hypercrypt'], disposition: null, limit: 1_000, units }, necrons(), null)

  it('names the detachment, the size, the centrepiece and the Warlord', () => {
    expect(priceOf([{ entryId: 'ctan' }, { entryId: 'hexmark', toggles: { warlord: 1 } }])?.label).toBe("HL 1K - C'tan & Hexmark")
  })

  it('does not name an invented Warlord toggle', () => {
    expect(priceOf([{ entryId: 'ctan' }, { entryId: 'hexmark', toggles: { invented: 1 } }])?.label).toBe("HL 1K - C'tan")
  })

  it('is the detachment and the size while the list is still empty', () => {
    expect(priceOf([])?.label).toBe('HL 1K')
  })
})

describe('roster-aware picker limits', () => {
  const loaded = bookOf({
    categoryEntries: [
      {
        id: 'allies',
        name: 'Allies',
        constraints: [{ id: 'cap', type: 'max', field: 'selections', scope: 'roster', includeChildSelections: true, value: 0 }],
        modifiers: [
          {
            field: 'cap',
            type: 'increment',
            value: 1,
            repeats: [{ childId: 'line', field: 'selections', scope: 'roster', includeChildSelections: true, value: 1, repeats: 1 }],
          },
        ],
      },
    ],
    selectionEntries: ['line', 'beast', 'hero'].map((id) => ({
      ...cappedLord(id, id),
      categoryLinks: id === 'line' ? [] : [{ id: `${id}-ally`, targetId: 'allies' }],
    })),
  })
  it.each([
    [[], 0],
    [['line'], 1],
    [['line', 'line'], 2],
    [['line', 'hero'], 0],
    [['line', 'beast'], 1],
  ] as const)('prices the available beast copies with roster %j', (ids, expected) => {
    const result = calculateRosterPrice(
      {
        catalogueId: 'cat',
        detachmentIds: [],
        disposition: null,
        limit: 2000,
        units: ids.map((entryId) => ({ entryId })),
        includeUnitLimits: true,
      },
      loaded,
      rulesWithout,
    )
    expect(result?.unitLimits?.find((unit) => unit.id === 'beast')?.limit).toBe(expected)
  })
})
