import { describe, expect, it } from 'vitest'
import { attachedUnit, attachmentErrors, attachmentOf } from './attach'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'

const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: 'pts', name: 'pts' }] } }

const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

const ability = (name: string, text: string) => ({ id: `${name}-profile`, name, characteristics: [{ name: 'Description', $text: text }] })

describe('a character that can join a unit', () => {
  it('is a leader when the ability is titled Leader', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'overlord',
          name: 'Overlord',
          type: 'model',
          infoGroups: [
            {
              id: 'g',
              name: 'Leader',
              profiles: [ability('Leader', 'This model can be attached to the following units:\n■ IMMORTALS\n■ LYCHGUARD')],
            },
          ],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('overlord')!, index)).toEqual({ kind: 'leader', targets: ['IMMORTALS', 'LYCHGUARD'] })
  })

  it('is supporting when the ability is titled after the model', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'plasmancer',
          name: 'Plasmancer',
          type: 'model',
          profiles: [ability('Plasmancer', 'This model can be attached to the following units:\n■ IMMORTALS')],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('plasmancer')!, index)).toEqual({ kind: 'support', targets: ['IMMORTALS'] })
  })

  it('reads a single attachment target', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'ancient',
          name: 'Bladeguard Ancient',
          type: 'model',
          profiles: [ability('Support', 'This model can be attached to the following unit:\n■ BLADEGUARD VETERAN SQUAD')],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('ancient')!, index)).toEqual({
      kind: 'support',
      targets: ['BLADEGUARD VETERAN SQUAD'],
    })
  })

  it('reads the comma-separated form the data also uses', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'geomancer',
          name: 'Geomancer',
          type: 'model',
          profiles: [
            ability(
              'Geomancer',
              'This model can be attached to the following units: ^^**Canoptek Macrocytes, Immortals, Necron Warriors**^^',
            ),
          ],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('geomancer')!, index)?.targets).toEqual([
      'Canoptek Macrocytes',
      'Immortals',
      'Necron Warriors',
    ])
  })

  it('stops after a target with the inverted emphasis closer', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'surgeon',
          name: 'Surgeon',
          type: 'model',
          profiles: [
            ability(
              'Leader',
              'This model can be attached to the following unit: ^^**Marines^^**\n*You can attach this model even if another Leader is attached.*',
            ),
          ],
        },
      ],
    })

    expect(attachmentOf(index.definitions.get('surgeon')!, index)).toEqual({ kind: 'leader', targets: ['Marines'] })
  })

  it('reads hyphenated attachment lists', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          profiles: [ability('Leader', 'This model can be attached to the following units:\n- Custodian Guard\n- Custodian Wardens')],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('captain')!, index)).toEqual({
      kind: 'leader',
      targets: ['Custodian Guard', 'Custodian Wardens'],
    })
  })

  it('expands inline category targets to matching units', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'inquisitor',
          name: 'Inquisitor',
          type: 'model',
          profiles: [ability('Leader', 'This model can be attached to the following units: IMPERIUM BATTLELINE INFANTRY, EXACTION SQUAD')],
        },
        {
          id: 'guard',
          name: 'Custodian Guard',
          type: 'unit',
          categoryLinks: [
            { id: 'imperium-link', targetId: 'imperium', name: 'Imperium' },
            { id: 'battleline-link', targetId: 'battleline', name: 'Battleline' },
            { id: 'infantry-link', targetId: 'infantry', name: 'Infantry' },
          ],
        },
      ],
    })

    expect(attachmentOf(index.definitions.get('inquisitor')!, index)?.targets).toEqual([
      'IMPERIUM BATTLELINE INFANTRY',
      'Custodian Guard',
      'EXACTION SQUAD',
    ])
  })

  it('reads an ability the entry links to rather than holds', () => {
    const index = indexOf({
      sharedInfoGroups: [
        {
          id: 'shared-leader',
          name: 'Leader',
          profiles: [ability('Leader', 'This model can be attached to the following units:\n■ IMMORTALS')],
        },
      ],
      sharedSelectionEntries: [{ id: 'lord', name: 'Lord', type: 'model', infoLinks: [{ id: 'l', targetId: 'shared-leader' }] }],
    })
    expect(attachmentOf(index.definitions.get('lord')!, index)?.targets).toEqual(['IMMORTALS'])
  })

  it('includes units that explicitly substitute for a named attachment target', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain in Terminator Armour',
          type: 'model',
          infoGroups: [
            {
              id: 'leader-group',
              name: 'Leader',
              profiles: [ability('Leader', 'This model can be attached to the following units:\n■ TERMINATOR SQUAD')],
            },
          ],
        },
        {
          id: 'deathwing',
          name: 'Deathwing Terminator Squad',
          type: 'unit',
          profiles: [
            ability(
              'Attached Unit',
              'If a Character unit from your army with the Leader ability can be attached to a Terminator Squad, it can be attached to this unit instead.',
            ),
          ],
        },
      ],
    })

    expect(attachmentOf(index.definitions.get('captain')!, index)?.targets).toEqual(['TERMINATOR SQUAD', 'Deathwing Terminator Squad'])
  })

  it('adds targets unlocked by a selected enhancement', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'chronomancer',
          name: 'Chronomancer',
          type: 'model',
          profiles: [ability('Support', 'This model can be attached to the following units:\n■ IMMORTALS')],
          selectionEntries: [{ id: 'murdermind', name: 'Murdermind', type: 'upgrade' }],
          associations: [
            {
              name: 'Supporting',
              childId: 'unit',
              action: 'group',
              conditionGroups: [
                {
                  type: 'or',
                  conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'self', childId: 'immortals' }],
                  conditionGroups: [
                    {
                      type: 'and',
                      conditions: [
                        {
                          type: 'atLeast',
                          value: 1,
                          field: 'selections',
                          scope: 'self',
                          childId: 'murdermind',
                          includeChildSelections: true,
                          queryFromSelf: true,
                        },
                      ],
                      conditionGroups: [
                        {
                          type: 'or',
                          conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'self', childId: 'heavy-destroyers' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { id: 'immortals', name: 'Immortals', type: 'unit' },
        { id: 'heavy-destroyers', name: 'Lokhust Heavy Destroyers', type: 'unit' },
      ],
      entryLinks: [
        { id: 'immortals-link', name: 'Immortals', type: 'selectionEntry', targetId: 'immortals' },
        { id: 'heavy-link', name: 'Lokhust Heavy Destroyers', type: 'selectionEntry', targetId: 'heavy-destroyers' },
      ],
    })
    const chronomancer = index.definitions.get('chronomancer')!

    expect(attachmentOf(chronomancer, index, { id: 'chronomancer' })?.targets).toEqual(['IMMORTALS'])
    expect(attachmentOf(chronomancer, index, { id: 'chronomancer', selections: [{ id: 'murdermind' }] })?.targets).toEqual([
      'IMMORTALS',
      'Lokhust Heavy Destroyers',
    ])
  })

  it('does not broaden substitutions limited to a named kind of character', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          infoGroups: [
            {
              id: 'leader-group',
              name: 'Leader',
              profiles: [ability('Leader', 'This model can be attached to the following units:\n■ TACTICAL SQUAD')],
            },
          ],
        },
        {
          id: 'death-company',
          name: 'Death Company Marines',
          type: 'unit',
          profiles: [
            ability(
              'Attached Unit',
              'If a Chaplain model from your army with the Leader ability can be attached to a Tactical Squad, it can be attached to this unit instead.',
            ),
          ],
        },
      ],
    })

    expect(attachmentOf(index.definitions.get('captain')!, index)?.targets).toEqual(['TACTICAL SQUAD'])
  })

  it('is nothing at all for a character whose ability says no such thing', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'trazyn',
          name: 'Trazyn',
          type: 'model',
          profiles: [ability('Trazyn', 'Once per battle, this model may do something else entirely.')],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('trazyn')!, index)).toBeNull()
  })

  it('is nothing when the claim is made but no unit is named', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        { id: 'vague', name: 'Vague', type: 'model', profiles: [ability('Vague', 'This model can be attached to the following units:')] },
      ],
    })
    expect(attachmentOf(index.definitions.get('vague')!, index)).toBeNull()
  })
})

describe('attachment legality', () => {
  it('rejects an incompatible host', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'leader',
          name: 'Leader',
          type: 'model',
          infoGroups: [
            { id: 'g', name: 'Leader', profiles: [ability('Leader', 'This model can be attached to the following units:\n■ SQUAD')] },
          ],
        },
        { id: 'tank', name: 'Tank', type: 'unit' },
      ],
    })
    expect(attachmentErrors([{ entryId: 'leader', attachedTo: 1 }, { entryId: 'tank' }], index)[0]?.message).toBe(
      'cannot be attached to Tank',
    )
  })

  it('accepts a named host', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'leader',
          name: 'Leader',
          type: 'model',
          infoGroups: [
            { id: 'g', name: 'Leader', profiles: [ability('Leader', 'This model can be attached to the following units:\n■ SQUAD')] },
          ],
        },
        { id: 'squad', name: 'SQUAD', type: 'unit' },
      ],
    })
    expect(attachmentErrors([{ entryId: 'leader', attachedTo: 1 }, { entryId: 'squad' }], index)).toEqual([])
  })

  it('allows one leader and one support, then refuses another of either kind', () => {
    const leader = (id: string, name: string) => ({
      id,
      name,
      type: 'model' as const,
      infoGroups: [
        {
          id: `${id}-g`,
          name: 'Leader',
          profiles: [ability('Leader', 'This model can be attached to the following units:\n■ SQUAD')],
        },
      ],
    })
    const index = indexOf({
      sharedSelectionEntries: [
        leader('overlord', 'Overlord'),
        leader('lord', 'Lord'),
        {
          id: 'ancient',
          name: 'Ancient',
          type: 'model',
          infoGroups: [
            {
              id: 'ancient-g',
              name: 'Ancient',
              profiles: [ability('Ancient', 'This model can be attached to the following units:\n■ SQUAD')],
            },
          ],
        },
        {
          id: 'apothecary',
          name: 'Apothecary',
          type: 'model',
          infoGroups: [
            {
              id: 'apothecary-g',
              name: 'Apothecary',
              profiles: [ability('Apothecary', 'This model can be attached to the following units:\n■ SQUAD')],
            },
          ],
        },
        { id: 'squad', name: 'SQUAD', type: 'unit' },
      ],
    })

    const one = [
      { entryId: 'overlord', attachedTo: 4 },
      { entryId: 'ancient', attachedTo: 4 },
      { entryId: 'lord' },
      { entryId: 'apothecary' },
      { entryId: 'squad' },
    ]
    expect(attachmentErrors(one, index)).toEqual([])

    const twoOfEach = [
      { entryId: 'overlord', attachedTo: 4 },
      { entryId: 'ancient', attachedTo: 4 },
      { entryId: 'lord', attachedTo: 4 },
      { entryId: 'apothecary', attachedTo: 4 },
      { entryId: 'squad' },
    ]
    expect(attachmentErrors(twoOfEach, index).map((error) => `${error.entryName}: ${error.message}`)).toEqual([
      'Lord: cannot lead SQUAD, which is already led by Overlord',
      'Apothecary: cannot support SQUAD, which is already supported by Ancient',
    ])
  })
})

describe('the unit an attachment makes', () => {
  // A Leader and a supporting character on one bodyguard unit: all three are one
  // unit, so each of them counts the other two.
  const attached = [{}, { attachedTo: 0 }, { attachedTo: 0 }]

  it('counts the host and everything else joined to it', () => {
    expect(attachedUnit(attached, 1)).toEqual([0, 2])
    expect(attachedUnit(attached, 2)).toEqual([0, 1])
  })

  it('counts everything joined to a host, from the host', () => {
    expect(attachedUnit(attached, 0)).toEqual([1, 2])
  })

  it('leaves a unit standing on its own alone', () => {
    expect(attachedUnit([{}, { attachedTo: 0 }, {}], 2)).toEqual([])
  })
})
