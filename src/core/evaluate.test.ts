import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile, type Modifier } from './catalogue'
import { evaluate, evaluateForces, keywordIds, rosterLimit, type Selection } from './evaluate'

const PTS = 'cost-pts'
const ENHANCEMENTS = 'cost-enhancements'

/** A game system carrying only what a points question needs, plus its kinds of force. */
const system: CatalogueFile = {
  gameSystem: {
    id: 'gs',
    name: 'Test',
    costTypes: [
      { id: PTS, name: 'pts' },
      { id: ENHANCEMENTS, name: 'Enhancements' },
    ],
    forceEntries: [
      { id: 'army-roster', name: 'Army Roster' },
      { id: 'crusade-force', name: 'Crusade Force' },
    ],
  },
}

const points = (value: number) => [{ name: 'pts', typeId: PTS, value }]

function indexOf(catalogue: Partial<Catalogue>) {
  return buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')
}

const evaluateOne = (selection: Selection, catalogue: Partial<Catalogue>) => evaluate([selection], indexOf(catalogue))

describe('costs', () => {
  it('are read from the entry', () => {
    const result = evaluateOne({ id: 'tank' }, { sharedSelectionEntries: [{ id: 'tank', name: 'Tank', type: 'unit', costs: points(150) }] })
    expect(result.points).toBe(150)
  })

  it('are counted once per selection', () => {
    const result = evaluateOne(
      { id: 'grunt', count: 5 },
      {
        sharedSelectionEntries: [{ id: 'grunt', name: 'Grunt', type: 'model', costs: points(12) }],
      },
    )
    expect(result.points).toBe(60)
  })

  it('are reported under the name the data gives the cost type', () => {
    const result = evaluateOne({ id: 'tank' }, { sharedSelectionEntries: [{ id: 'tank', name: 'Tank', type: 'unit', costs: points(150) }] })
    expect(result.costs.pts).toBe(150)
  })

  it('applies a conditional base price before multiplying it', () => {
    const result = evaluateOne(
      { id: 'agents', selections: [{ id: 'body', count: 12 }] },
      {
        sharedSelectionEntries: [
          {
            id: 'agents',
            name: 'Agents',
            type: 'unit',
            costs: points(50),
            modifiers: [
              {
                type: 'multiply',
                field: PTS,
                value: 2,
                conditions: [{ type: 'atLeast', value: 7, field: 'selections', scope: 'agents', childId: 'model' }],
              },
              { type: 'set', field: PTS, value: 60 },
            ],
            selectionEntries: [{ id: 'body', name: 'Body', type: 'model' }],
          },
        ],
      },
    )
    expect(result.points).toBe(120)
  })

  it('divides a shared allowance between matching selections', () => {
    const upgrade = {
      id: 'upgrade',
      name: 'Upgrade',
      type: 'upgrade' as const,
      costs: [{ name: 'Enhancements', typeId: ENHANCEMENTS, value: 1 }],
      modifiers: [
        {
          type: 'divide' as const,
          field: ENHANCEMENTS,
          value: 2,
          conditions: [
            {
              type: 'equalTo' as const,
              value: 2,
              field: 'selections',
              scope: 'roster',
              childId: 'upgrade',
              includeChildSelections: true,
            },
          ],
        },
      ],
    }
    const result = evaluate(
      [
        { id: 'unit-one', selections: [{ id: 'upgrade' }] },
        { id: 'unit-two', selections: [{ id: 'upgrade' }] },
      ],
      indexOf({
        sharedSelectionEntries: [
          { id: 'unit-one', name: 'Unit one', type: 'unit', selectionEntries: [upgrade] },
          { id: 'unit-two', name: 'Unit two', type: 'unit', selectionEntries: [upgrade] },
        ],
      }),
    )

    expect({ cost: result.costs.Enhancements, unhandled: result.unhandled }).toEqual({ cost: 1, unhandled: [] })
  })
})

describe('per-model parent constraints', () => {
  const catalogue = (): Partial<Catalogue> => ({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Squad',
        type: 'unit',
        selectionEntries: [
          {
            id: 'veteran',
            name: 'Veteran',
            type: 'model',
            selectionEntryGroups: [
              {
                id: 'pistol-option',
                name: 'Pistol Option',
                constraints: [{ id: 'pistol-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  {
                    id: 'pistol',
                    name: 'Pistol',
                    type: 'upgrade',
                    constraints: [{ id: 'pistol-entry-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  it('scales an unmarked group and its option across an aggregated model entry', () => {
    const result = evaluateOne(
      {
        id: 'squad',
        selections: [
          {
            id: 'veteran',
            count: 4,
            selections: [{ id: 'pistol-option', selections: [{ id: 'pistol', count: 4 }] }],
          },
        ],
      },
      catalogue(),
    )

    expect(result.errors).toEqual([])
  })
})

/**
 * The shape every squad in the real data uses: one price on the unit, replaced by
 * a bigger one once enough models are in the group beneath it.
 */
const squad = (): Partial<Catalogue> => ({
  sharedSelectionEntries: [
    {
      id: 'squad',
      name: 'Squad',
      type: 'unit',
      costs: points(80),
      modifiers: [
        {
          type: 'set',
          field: PTS,
          value: 150,
          conditions: [
            { type: 'atLeast', value: 6, field: 'selections', scope: 'squad', childId: 'troopers', includeChildSelections: true },
          ],
        },
      ],
      selectionEntryGroups: [
        {
          id: 'troopers',
          name: 'Troopers',
          constraints: [{ id: 'min', type: 'min', value: 4, field: 'selections', scope: 'parent' }],
          selectionEntries: [{ id: 'trooper', name: 'Trooper', type: 'model' }],
        },
      ],
    },
  ],
})

const withTroopers = (count: number): Selection => ({
  id: 'squad',
  selections: [{ id: 'troopers', selections: [{ id: 'trooper', count }] }],
})

describe('a squad priced by its size', () => {
  it('keeps the base price below the threshold', () => {
    expect(evaluateOne(withTroopers(4), squad()).points).toBe(80)
  })

  it('takes the larger price once the group is big enough', () => {
    expect(evaluateOne(withTroopers(9), squad()).points).toBe(150)
  })

  it('counts the models inside a group rather than the group itself', () => {
    // A group is a container, not one selection. Counting it as one priced every
    // large squad as a small one.
    expect(evaluateOne(withTroopers(6), squad()).points).toBe(150)
  })
})

/**
 * The same squad, priced by a condition that counts `model` selections directly
 * under the unit — no group named, and no `includeChildSelections`. Most of the
 * real data is written this way.
 */
const squadCountingModels = (): Partial<Catalogue> => ({
  sharedSelectionEntries: [
    {
      id: 'squad',
      name: 'Squad',
      type: 'unit',
      costs: points(80),
      modifiers: [
        {
          type: 'set',
          field: PTS,
          value: 150,
          conditions: [{ type: 'atLeast', value: 6, field: 'selections', scope: 'squad', childId: 'model' }],
        },
      ],
      selectionEntryGroups: [{ id: 'troopers', name: 'Troopers', selectionEntries: [{ id: 'trooper', name: 'Trooper', type: 'model' }] }],
    },
  ],
})

describe('a group between a unit and its models', () => {
  it('does not hide them from a condition counting what is under the unit', () => {
    // A group organises the catalogue; it is not a level of nesting in a roster.
    // Treating it as one made every unit written this way look empty.
    expect(evaluateOne(withTroopers(6), squadCountingModels()).points).toBe(150)
  })

  it('still leaves a small squad at the base price', () => {
    expect(evaluateOne(withTroopers(3), squadCountingModels()).points).toBe(80)
  })
})

describe('per-model costs', () => {
  it('apply once per repeat of what they count', () => {
    const result = evaluateOne(withTroopers(6), {
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          costs: points(0),
          modifiers: [
            {
              type: 'increment',
              field: PTS,
              value: 10,
              repeats: [{ value: 2, repeats: 1, field: 'selections', scope: 'squad', childId: 'troopers', includeChildSelections: true }],
            },
          ],
          selectionEntryGroups: [
            { id: 'troopers', name: 'Troopers', selectionEntries: [{ id: 'trooper', name: 'Trooper', type: 'model' }] },
          ],
        },
      ],
    })
    expect(result.points).toBe(30)
  })
})

describe('gates', () => {
  it.each([
    { selected: ['alpha'], points: 100 },
    { selected: ['alpha', 'bravo'], points: 115 },
    { selected: ['alpha', 'bravo', 'charlie', 'delta'], points: 100 },
  ])('applies a count group within its minimum and maximum bounds for $selected', ({ selected, points: expected }) => {
    const options = ['alpha', 'bravo', 'charlie', 'delta']
    const result = evaluateOne(
      { id: 'tank', selections: selected.map((id) => ({ id })) },
      {
        sharedSelectionEntries: [
          {
            id: 'tank',
            name: 'Tank',
            type: 'unit',
            costs: points(100),
            modifiers: [
              {
                type: 'increment',
                field: PTS,
                value: 15,
                conditionGroups: [
                  {
                    type: 'count',
                    min: 2,
                    max: 3,
                    conditions: options.map((childId) => ({
                      type: 'atLeast',
                      value: 1,
                      field: 'selections',
                      scope: 'self',
                      childId,
                    })),
                  },
                ],
              },
            ],
            selectionEntries: options.map((id) => ({ id, name: id, type: 'upgrade' })),
          },
        ],
      },
    )

    expect({ points: result.points, unhandled: result.unhandled }).toEqual({ points: expected, unhandled: [] })
  })

  it('refuse a condition group whose contents were not understood', () => {
    // Failing closed matters: a gate the evaluator cannot read must not be able
    // to add points, which is what an empty `and` did when read as satisfied.
    const result = evaluateOne(
      { id: 'tank' },
      {
        sharedSelectionEntries: [
          {
            id: 'tank',
            name: 'Tank',
            type: 'unit',
            costs: points(100),
            modifiers: [{ type: 'increment', field: PTS, value: 15, conditionGroups: [{ type: 'and' }] }],
          },
        ],
      },
    )
    expect(result.points).toBe(100)
  })

  it('say so, rather than passing silently', () => {
    const result = evaluateOne(
      { id: 'tank' },
      {
        sharedSelectionEntries: [
          {
            id: 'tank',
            name: 'Tank',
            type: 'unit',
            costs: points(100),
            modifiers: [{ type: 'increment', field: PTS, value: 15, conditionGroups: [{ type: 'and' }] }],
          },
        ],
      },
    )
    expect(result.unhandled).toContain('condition group with nothing readable in it')
  })
})

describe('legality', () => {
  it('reports a group that is under its minimum', () => {
    const result = evaluateOne(withTroopers(2), squad())
    expect(result.errors).toEqual([{ entryId: 'troopers', entryName: 'Troopers', message: 'needs at least 4, has 2' }])
  })

  it('accepts a group that meets its minimum', () => {
    expect(evaluateOne(withTroopers(4), squad()).errors).toEqual([])
  })

  it('reports a maximum that has been exceeded', () => {
    const result = evaluateOne(
      { id: 'squad', selections: [{ id: 'trooper', count: 4 }] },
      {
        sharedSelectionEntries: [
          {
            id: 'squad',
            name: 'Squad',
            type: 'unit',
            selectionEntries: [
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                constraints: [{ id: 'cap', type: 'max', value: 3, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
    )
    expect(result.errors[0]?.message).toBe('allows at most 3, has 4')
  })

  it('treats a negative limit as no limit', () => {
    const result = evaluateOne(
      { id: 'squad', selections: [{ id: 'trooper', count: 99 }] },
      {
        sharedSelectionEntries: [
          {
            id: 'squad',
            name: 'Squad',
            type: 'unit',
            selectionEntries: [
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                constraints: [{ id: 'cap', type: 'max', value: -1, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
    )
    expect(result.errors).toEqual([])
  })

  it('takes a limit raised by a modifier aimed at the constraint', () => {
    const result = evaluateOne(
      { id: 'squad', selections: [{ id: 'trooper', count: 4 }] },
      {
        sharedSelectionEntries: [
          {
            id: 'squad',
            name: 'Squad',
            type: 'unit',
            selectionEntries: [
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                constraints: [{ id: 'cap', type: 'max', value: 3, field: 'selections', scope: 'parent' }],
                modifiers: [{ type: 'set', field: 'cap', value: 6 }],
              },
            ],
          },
        ],
      },
    )
    expect(result.errors).toEqual([])
  })

  it('reports a conditional catalogue error modifier', () => {
    const result = evaluate(
      [{ id: 'farsight' }, { id: 'ethereal' }],
      indexOf({
        sharedSelectionEntries: [
          {
            id: 'farsight',
            name: 'Commander Farsight',
            type: 'model',
            modifiers: [
              {
                type: 'add',
                field: 'error',
                value: 'Cannot take Commander Farsight and an Ethereal in the same army.',
                conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'roster', childId: 'ethereal' }],
              },
            ],
          },
          { id: 'ethereal', name: 'Ethereal', type: 'model' },
        ],
      }),
    )
    expect(result.errors).toEqual([
      {
        entryId: 'farsight',
        entryName: 'Commander Farsight',
        message: 'Cannot take Commander Farsight and an Ethereal in the same army.',
      },
    ])
  })
})

describe('a surcharge that depends on the book the list is from', () => {
  const chapterSurcharge = (): Partial<Catalogue> => ({
    sharedSelectionEntries: [
      {
        id: 'captain',
        name: 'Captain',
        type: 'model',
        costs: points(75),
        modifiers: [
          {
            type: 'increment',
            field: PTS,
            value: 5,
            conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'primary-catalogue', childId: 'cat' }],
          },
        ],
      },
    ],
  })

  it('applies in its own book', () => {
    const result = evaluate([{ id: 'captain' }], indexOf(chapterSurcharge()), { primaryCatalogueId: 'cat' })
    expect(result.points).toBe(80)
  })

  it('does not apply in another book', () => {
    const result = evaluate([{ id: 'captain' }], indexOf(chapterSurcharge()), { primaryCatalogueId: 'other' })
    expect(result.points).toBe(75)
  })

  it('says so when no book was named, rather than charging either way silently', () => {
    const result = evaluate([{ id: 'captain' }], indexOf(chapterSurcharge()))
    expect(result.unhandled).toContain('scope primary-catalogue without a catalogue to compare')
  })
})

describe('an unknown selection', () => {
  it('is named in the census rather than ignored', () => {
    expect(evaluateOne({ id: 'nonsense' }, {}).unhandled).toContain('unknown selection id nonsense')
  })
})

describe('keywords', () => {
  /** A cost that only applies inside a model carrying a category. */
  const catalogue = (): Partial<Catalogue> => ({
    sharedSelectionEntries: [
      {
        id: 'captain',
        name: 'Captain',
        type: 'model',
        costs: points(75),
        categoryLinks: [{ id: 'link', targetId: 'character' }],
        modifiers: [
          {
            type: 'increment',
            field: PTS,
            value: 10,
            conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'roster', childId: 'character' }],
          },
        ],
      },
      { id: 'grunt', name: 'Grunt', type: 'model', costs: points(20) },
    ],
  })

  it('are matched through category links', () => {
    // "Is this a character" is written as a category test, not a name test.
    expect(evaluateOne({ id: 'captain' }, catalogue()).points).toBe(85)
  })

  it('do not match a selection that lacks them', () => {
    expect(evaluateOne({ id: 'grunt' }, catalogue()).points).toBe(20)
  })
})

describe('a keyword the data grants', () => {
  /**
   * The shape the Dark Angels book uses: a Terminator-armour character is DEATHWING
   * only when that book is the one the list is built from, written as a category the
   * entry gains rather than one it links.
   */
  const catalogue = (grant: Partial<Catalogue>['sharedSelectionEntries']): Partial<Catalogue> => ({
    categoryEntries: [{ id: 'deathwing', name: 'Deathwing' }],
    sharedSelectionEntries: grant,
  })

  const chaplain = (modifiers: Modifier[]): Partial<Catalogue>['sharedSelectionEntries'] => [
    {
      id: 'chaplain',
      name: 'Chaplain in Terminator Armour',
      type: 'model',
      costs: points(75),
      categoryLinks: [{ id: 'link', targetId: 'character' }],
      modifiers,
    },
    {
      id: 'assault',
      name: 'Deathwing Assault',
      type: 'upgrade',
      costs: points(15),
      modifiers: [
        {
          type: 'increment',
          field: PTS,
          value: 5,
          conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'roster', childId: 'deathwing' }],
        },
      ],
    },
  ]

  const inItsOwnBook: Modifier[] = [
    {
      type: 'add',
      field: 'category',
      value: 'deathwing',
      conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'primary-catalogue', childId: 'cat' }],
    },
  ]

  it('is carried in the book that grants it', () => {
    const index = indexOf(catalogue(chaplain(inItsOwnBook)))
    expect(keywordIds([{ id: 'chaplain' }], 0, index, { primaryCatalogueId: 'cat' })).toContain('deathwing')
  })

  it('is not carried in another book', () => {
    const index = indexOf(catalogue(chaplain(inItsOwnBook)))
    expect(keywordIds([{ id: 'chaplain' }], 0, index, { primaryCatalogueId: 'other' })).not.toContain('deathwing')
  })

  it('answers a condition that tests for it, which is what gates an enhancement', () => {
    const index = indexOf(catalogue(chaplain(inItsOwnBook)))
    const roster = [{ id: 'chaplain' }, { id: 'assault' }]
    expect(evaluate(roster, index, { primaryCatalogueId: 'cat' }).points).toBe(95)
    expect(evaluate(roster, index, { primaryCatalogueId: 'other' }).points).toBe(90)
  })

  it('reaches the selection the grant is aimed at rather than the one holding it', () => {
    const index = indexOf({
      categoryEntries: [{ id: 'deathwing', name: 'Deathwing' }],
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Terminator Squad',
          type: 'unit',
          selectionEntries: [
            {
              id: 'oath',
              name: 'Oath',
              type: 'upgrade',
              modifiers: [{ type: 'add', field: 'category', value: 'deathwing', scope: 'parent' }],
            },
          ],
        },
      ],
    })
    expect(keywordIds([{ id: 'squad', selections: [{ id: 'oath' }] }], 0, index)).toContain('deathwing')
    expect(keywordIds([{ id: 'squad' }], 0, index)).not.toContain('deathwing')
  })

  it('can be withdrawn, and the withdrawal is what the list carries', () => {
    const index = indexOf({
      categoryEntries: [{ id: 'battleline', name: 'Battleline' }],
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          categoryLinks: [{ id: 'link', targetId: 'battleline', name: 'Battleline' }],
          modifiers: [{ type: 'remove', field: 'category', value: 'battleline' }],
        },
      ],
    })
    expect(keywordIds([{ id: 'squad' }], 0, index)).not.toContain('battleline')
  })

  it('says so when it changes which keyword is primary, rather than shelving it silently', () => {
    const index = indexOf({
      categoryEntries: [{ id: 'deathwing', name: 'Deathwing' }],
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          costs: points(40),
          modifiers: [{ type: 'set-primary', field: 'category', value: 'deathwing' }],
          constraints: [{ id: 'cap', type: 'max', value: 1, field: 'selections', scope: 'roster' }],
        },
      ],
    })
    expect(evaluate([{ id: 'squad' }], index).unhandled).toContain('category modifier set-primary')
  })

  it('is withdrawn when the same entry writes the withdrawal last', () => {
    // Saint Potentia's shape: one entry both grants a keyword and takes it away, and
    // which one wins is the order the data writes them in.
    const index = indexOf({
      categoryEntries: [{ id: 'saint', name: 'Saint Potentia' }],
      sharedSelectionEntries: [
        {
          id: 'canoness',
          name: 'Canoness',
          type: 'model',
          modifiers: [
            { type: 'add', field: 'category', value: 'saint' },
            { type: 'remove', field: 'category', value: 'saint' },
          ],
        },
      ],
    })
    expect(keywordIds([{ id: 'canoness' }], 0, index)).not.toContain('saint')
  })

  it('is read from the written links and never from another grant', () => {
    /**
     * A chain of three: `deathwing` is written down, `ravenwing` is granted off it, and
     * `wulfen` is granted off `ravenwing`. Only the first link in that chain is a fact
     * the data states, so only the first grant lands. Reading a grant off another grant
     * would hand `wulfen` to whichever unit the walk reached second, which is why the
     * answer is asserted in both orders.
     */
    const grant = (id: string, keyword: string, from: string) => ({
      id,
      name: id,
      type: 'unit' as const,
      modifiers: [
        {
          type: 'add' as const,
          field: 'category',
          value: keyword,
          conditions: [{ type: 'instanceOf' as const, value: 1, field: 'selections', scope: 'roster', childId: from }],
        },
      ],
    })
    const index = indexOf({
      categoryEntries: [
        { id: 'deathwing', name: 'Deathwing' },
        { id: 'ravenwing', name: 'Ravenwing' },
        { id: 'wulfen', name: 'Wulfen' },
      ],
      sharedSelectionEntries: [
        { id: 'seed', name: 'Seed', type: 'unit', categoryLinks: [{ id: 'link', targetId: 'deathwing' }] },
        grant('rider', 'ravenwing', 'deathwing'),
        grant('howler', 'wulfen', 'ravenwing'),
      ],
    })
    const inOrder = [{ id: 'seed' }, { id: 'rider' }, { id: 'howler' }]
    const reversed = [{ id: 'seed' }, { id: 'howler' }, { id: 'rider' }]
    expect(keywordIds(inOrder, 1, index)).toContain('ravenwing')
    expect(keywordIds(inOrder, 2, index)).not.toContain('wulfen')
    expect(keywordIds(reversed, 1, index)).not.toContain('wulfen')
  })
})

describe('a second copy of the same unit', () => {
  /**
   * The real shape of eleventh edition's escalating unit costs: a surcharge gated on
   * there being one of these already in the list, expressed as a local condition
   * group counting selections that come *before* this one.
   */
  const catalogue = (): Partial<Catalogue> => ({
    sharedSelectionEntries: [
      {
        id: 'tank',
        name: 'Tank',
        type: 'unit',
        costs: points(220),
        modifiers: [
          {
            type: 'increment',
            field: PTS,
            value: 20,
            conditionGroups: [
              {
                type: 'and',
                localConditionGroups: [
                  {
                    type: 'atLeast',
                    value: 1,
                    field: 'selections',
                    scope: 'roster',
                    includeChildSelections: true,
                    conditions: [
                      { type: 'before', value: 1, field: 'selections', scope: 'self', childId: 'any' },
                      { type: 'instanceOf', value: 1, field: 'selections', scope: 'self', childId: 'tank' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        categoryLinks: [{ id: 'link', targetId: 'tank' }],
      },
    ],
  })

  it('leaves the first at its base price', () => {
    expect(evaluate([{ id: 'tank' }], indexOf(catalogue())).points).toBe(220)
  })

  it('charges the surcharge on the second and not the first', () => {
    // 220 + 240: the second copy is dearer because one came before it.
    expect(evaluate([{ id: 'tank' }, { id: 'tank' }], indexOf(catalogue())).points).toBe(460)
  })

  it('charges it on every copy after the first', () => {
    expect(evaluate([{ id: 'tank' }, { id: 'tank' }, { id: 'tank' }], indexOf(catalogue())).points).toBe(700)
  })
})

describe("the roster's force", () => {
  /** Campaign content is gated on the roster being a Crusade force, and it is not. */
  const catalogue = (): Partial<Catalogue> => ({
    sharedSelectionEntries: [
      {
        id: 'tank',
        name: 'Tank',
        type: 'unit',
        costs: points(100),
        constraints: [{ id: 'per-force', type: 'max', value: 1, field: 'selections', scope: 'force', includeChildSelections: true }],
        modifiers: [
          {
            type: 'increment',
            field: PTS,
            value: 25,
            conditions: [{ type: 'atLeast', value: 1, field: 'forces', scope: 'roster', childId: 'crusade-force' }],
          },
        ],
      },
    ],
  })

  it('is the Army Roster, so campaign-only cost does not apply', () => {
    expect(evaluate([{ id: 'tank' }], indexOf(catalogue())).points).toBe(100)
  })

  it('answers a count of forces rather than shrugging', () => {
    expect(evaluate([{ id: 'tank' }], indexOf(catalogue())).unhandled).not.toContain('field forces')
  })

  it('is what a force-scoped limit counts within', () => {
    const result = evaluate([{ id: 'tank' }, { id: 'tank' }], indexOf(catalogue()))
    expect(result.errors[0]?.message).toBe('allows at most 1, has 2')
  })

  it('is transparent when counting selections, so nothing else sees a new layer', () => {
    const squadded = evaluateOne(withTroopers(6), squadCountingModels())
    expect(squadded.points).toBe(150)
  })
})

describe('the limit on how many of a datasheet a roster may hold', () => {
  it('is the roster-scoped maximum the data states', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'lord',
          name: 'Lord',
          type: 'model',
          constraints: [{ id: 'lord-max', type: 'max', value: 3, field: 'selections', scope: 'roster', includeChildSelections: true }],
        },
      ],
    })
    expect(rosterLimit(index.definitions.get('lord')!, index)).toBe(3)
  })

  it('is null when nothing in the data limits it', () => {
    const index = indexOf({ sharedSelectionEntries: [{ id: 'grunt', name: 'Grunt', type: 'unit' }] })
    expect(rosterLimit(index.definitions.get('grunt')!, index)).toBeNull()
  })

  it('follows a modifier that lowers it for a smaller game', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'lord',
          name: 'Lord',
          type: 'model',
          constraints: [{ id: 'lord-max', type: 'max', value: 3, field: 'selections', scope: 'roster', includeChildSelections: true }],
          modifiers: [
            {
              type: 'set',
              field: 'lord-max',
              value: 2,
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'roster', childId: 'small-game', shared: true }],
            },
          ],
        },
        { id: 'small-game', name: 'Incursion', type: 'upgrade' },
      ],
    })
    expect(rosterLimit(index.definitions.get('lord')!, index, { roster: [{ id: 'small-game' }] })).toBe(2)
  })

  it('ignores a maximum about something other than how many are taken', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'lord',
          name: 'Lord',
          type: 'model',
          constraints: [{ id: 'lord-pts', type: 'max', value: 500, field: 'cost-pts', scope: 'roster' }],
        },
      ],
    })
    expect(rosterLimit(index.definitions.get('lord')!, index)).toBeNull()
  })
})

const cappedBook = (max: number) => ({
  categoryEntries: [
    {
      id: 'cat-immortals',
      name: 'Immortals',
      constraints: [{ id: 'imm-max', type: 'max' as const, value: max, field: 'selections', scope: 'force' }],
    },
  ],
  sharedSelectionEntries: [
    {
      id: 'immortals',
      name: 'Immortals',
      type: 'unit' as const,
      categoryLinks: [{ id: 'l', targetId: 'cat-immortals', name: 'Immortals' }],
    },
  ],
})

describe('a limit written on the datasheet’s own category', () => {
  it('is the limit, because that is where the data puts it', () => {
    const index = indexOf(cappedBook(6))
    expect(rosterLimit(index.definitions.get('immortals')!, index)).toBe(6)
  })

  it('applies independently to each force', () => {
    const index = indexOf(cappedBook(1))
    expect(evaluateForces([[{ id: 'immortals' }], [{ id: 'immortals' }]], index).errors).toEqual([])
  })

  it('is ignored when it says there is no cap', () => {
    const index = indexOf(cappedBook(-1))
    expect(rosterLimit(index.definitions.get('immortals')!, index)).toBeNull()
  })

  it('yields to a stricter limit on the entry itself', () => {
    const index = indexOf({
      ...cappedBook(6),
      sharedSelectionEntries: [
        {
          id: 'immortals',
          name: 'Immortals',
          type: 'unit',
          categoryLinks: [{ id: 'l', targetId: 'cat-immortals', name: 'Immortals' }],
          constraints: [{ id: 'own-max', type: 'max', value: 2, field: 'selections', scope: 'roster' }],
        },
      ],
    })
    expect(rosterLimit(index.definitions.get('immortals')!, index)).toBe(2)
  })
})
