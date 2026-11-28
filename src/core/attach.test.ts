import { describe, expect, it } from 'vitest'
import { attachmentErrors, attachmentLimitsOf, attachmentOf, referenceAttachmentOf } from './attach'
import { attachedUnit } from './attachedUnits'
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

  it('reads a leader requirement before an inline target list', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'ancient',
          name: 'Ancient',
          type: 'model',
          profiles: [
            ability(
              'Support',
              'This SUPPORT model can be attached to the following units (which already have a Leader): Assault Intercessor Squad, Hellblaster Squad.',
            ),
          ],
        },
      ],
    })

    expect(attachmentOf(index.definitions.get('ancient')!, index)).toEqual({
      kind: 'support',
      targets: ['Assault Intercessor Squad', 'Hellblaster Squad'],
      requiresLeader: true,
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

  it('keeps attachment footnotes out of target identities', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'surgeon',
          name: 'Surgeon',
          type: 'model',
          profiles: [ability('Leader', 'This model can be attached to the following unit: ^^**Marines†\n†An attachment exception.**^^')],
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

  const inquisitorAndScions = () =>
    indexOf({
      sharedSelectionEntries: [
        {
          id: 'inquisitor',
          name: 'Inquisitor',
          type: 'model',
          profiles: [ability('Leader', 'This model can be attached to the following units: IMPERIUM BATTLELINE INFANTRY')],
        },
        { id: 'scions', name: 'Tempestus Scions', type: 'unit' },
      ],
    })

  it('joins a unit that holds the named keywords in this list', () => {
    expect(
      attachmentErrors(
        [{ entryId: 'inquisitor', attachedTo: 1 }, { entryId: 'scions' }],
        inquisitorAndScions(),
        [],
        [[], ['Faction: Imperium', 'Battleline', 'Infantry']],
      ),
    ).toEqual([])
  })

  it('refuses a unit missing one of the named keywords in this list', () => {
    expect(
      attachmentErrors(
        [{ entryId: 'inquisitor', attachedTo: 1 }, { entryId: 'scions' }],
        inquisitorAndScions(),
        [],
        [[], ['Imperium', 'Infantry']],
      ),
    ).toEqual([{ entryId: 'inquisitor', entryName: 'Inquisitor', message: 'cannot be attached to Tempestus Scions' }])
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

  it('shows a datasheet page its ability text rather than wider association targets', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'chronomancer',
          name: 'Chronomancer',
          type: 'model',
          profiles: [ability('Support', 'This model can be attached to the following units:\n■ IMMORTALS')],
          associations: [
            {
              name: 'Supporting',
              childId: 'unit',
              action: 'group',
              conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'self', childId: 'heavy-destroyers' }],
            },
          ],
        },
        { id: 'heavy-destroyers', name: 'Lokhust Heavy Destroyers', type: 'unit' },
      ],
      entryLinks: [{ id: 'heavy-link', name: 'Lokhust Heavy Destroyers', type: 'selectionEntry', targetId: 'heavy-destroyers' }],
    })

    expect(referenceAttachmentOf(index.definitions.get('chronomancer')!, index)?.targets).toEqual(['IMMORTALS'])
  })

  it("shows a datasheet page without ability text its associations beside VS Data's hosts", () => {
    const index = {
      ...indexOf({
        sharedSelectionEntries: [
          {
            id: 'agent',
            name: 'Martial Agent',
            type: 'model',
            associations: [
              {
                name: 'Leading',
                childId: 'unit',
                action: 'group',
                conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'self', childId: 'tacticals' }],
              },
            ],
          },
          { id: 'tacticals', name: 'Tactical Squad', type: 'unit' },
        ],
        entryLinks: [{ id: 'tactical-link', name: 'Tactical Squad', type: 'selectionEntry', targetId: 'tacticals' }],
      }),
      attachments: { agent: { kind: 'leader' as const, targets: ['Crusaders'], named: ['Crusaders'] } },
    }

    expect(referenceAttachmentOf(index.definitions.get('agent')!, index)?.targets).toEqual(['Tactical Squad', 'Crusaders'])
  })

  it('names each host on a datasheet page as its datasheet is named', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'lieutenant',
          name: 'Lieutenant',
          type: 'model',
          profiles: [ability('Support', 'This model can be attached to the following unit:\n■ CRUSADER SQUAD')],
        },
        { id: 'crusaders', name: 'Crusader Squad', type: 'unit' },
      ],
      entryLinks: [{ id: 'crusader-link', name: 'Crusader Squad', type: 'selectionEntry', targetId: 'crusaders' }],
    })

    expect(referenceAttachmentOf(index.definitions.get('lieutenant')!, index)?.targets).toEqual(['Crusader Squad'])
  })

  it('offers a unit association only datasheets that are units', () => {
    const index = indexOf({
      categoryEntries: [{ id: 'tacticus', name: 'Tacticus' }],
      sharedSelectionEntries: [
        {
          id: 'champion',
          name: 'Champion of the Chapter',
          type: 'model',
          associations: [
            {
              name: 'Leading',
              childId: 'unit',
              action: 'group',
              conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'self', childId: 'tacticus' }],
            },
          ],
        },
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          categoryLinks: [{ id: 'captain-tacticus', name: 'Tacticus', targetId: 'tacticus' }],
        },
        {
          id: 'intercessors',
          name: 'Intercessor Squad',
          type: 'unit',
          categoryLinks: [{ id: 'intercessor-tacticus', name: 'Tacticus', targetId: 'tacticus' }],
        },
      ],
      entryLinks: [
        { id: 'captain-link', name: 'Captain', type: 'selectionEntry', targetId: 'captain' },
        { id: 'intercessors-link', name: 'Intercessor Squad', type: 'selectionEntry', targetId: 'intercessors' },
      ],
    })

    expect(attachmentOf(index.definitions.get('champion')!, index, { id: 'champion' })?.targets).toEqual(['Intercessor Squad'])
  })

  it("reads a candidate unit's keywords from its models too", () => {
    const index = indexOf({
      categoryEntries: [
        { id: 'tacticus', name: 'Tacticus' },
        { id: 'character', name: 'Character' },
      ],
      sharedSelectionEntries: [
        {
          id: 'champion',
          name: 'Champion of the Chapter',
          type: 'model',
          associations: [
            {
              name: 'Leading',
              childId: 'unit',
              action: 'group',
              conditionGroups: [
                {
                  type: 'and',
                  conditions: [
                    { type: 'instanceOf', value: 1, field: 'selections', scope: 'self', childId: 'tacticus' },
                    { type: 'notInstanceOf', value: 1, field: 'selections', scope: 'self', childId: 'character' },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'grimaldus',
          name: 'Chaplain Grimaldus',
          type: 'unit',
          categoryLinks: [{ id: 'grimaldus-tacticus', name: 'Tacticus', targetId: 'tacticus' }],
          selectionEntries: [
            {
              id: 'grimaldus-model',
              name: 'Chaplain Grimaldus',
              type: 'model',
              categoryLinks: [{ id: 'grimaldus-character', name: 'Character', targetId: 'character' }],
            },
          ],
        },
        {
          id: 'intercessors',
          name: 'Intercessor Squad',
          type: 'unit',
          categoryLinks: [{ id: 'intercessor-tacticus', name: 'Tacticus', targetId: 'tacticus' }],
          selectionEntries: [{ id: 'intercessor', name: 'Intercessor', type: 'model' }],
        },
      ],
      entryLinks: [
        { id: 'grimaldus-link', name: 'Chaplain Grimaldus', type: 'selectionEntry', targetId: 'grimaldus' },
        { id: 'intercessors-link', name: 'Intercessor Squad', type: 'selectionEntry', targetId: 'intercessors' },
      ],
    })

    expect(attachmentOf(index.definitions.get('champion')!, index, { id: 'champion' })?.targets).toEqual(['Intercessor Squad'])
  })

  describe('through an association named after its own ability', () => {
    const indexWithJoin = (min: number) =>
      indexOf({
        categoryEntries: [{ id: 'command-squad-category', name: 'Command Squad' }],
        sharedSelectionEntries: [
          {
            id: 'ogryn-bodyguard',
            name: 'Ogryn Bodyguard',
            type: 'model',
            associations: [
              {
                name: 'Loyal Protector',
                childId: 'unit',
                action: 'group',
                min,
                conditionGroups: [
                  {
                    type: 'or',
                    conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'self', childId: 'command-squad-category' }],
                  },
                ],
              },
            ],
          },
          {
            id: 'cadian-command-squad',
            name: 'Cadian Command Squad',
            type: 'unit',
            categoryLinks: [{ id: 'command-link', name: 'Command Squad', targetId: 'command-squad-category' }],
          },
        ],
        entryLinks: [{ id: 'command-squad-link', name: 'Cadian Command Squad', type: 'selectionEntry', targetId: 'cadian-command-squad' }],
      })

    it('supports the matching units when the join is required', () => {
      const index = indexWithJoin(1)

      expect(attachmentOf(index.definitions.get('ogryn-bodyguard')!, index, { id: 'ogryn-bodyguard' })).toEqual({
        kind: 'support',
        targets: ['Cadian Command Squad'],
      })
    })

    it('stays unattachable when the join is optional', () => {
      const index = indexWithJoin(0)

      expect(attachmentOf(index.definitions.get('ogryn-bodyguard')!, index, { id: 'ogryn-bodyguard' })).toBeNull()
    })
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
  it('requires a valid attached leader even when support precedes it', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          profiles: [ability('Leader', 'This model can be attached to the following units: SQUAD')],
        },
        {
          id: 'ancient',
          name: 'Ancient',
          type: 'model',
          profiles: [ability('Support', 'This model can be attached to the following units (which already have a Leader): SQUAD')],
        },
        { id: 'squad', name: 'SQUAD', type: 'unit' },
        { id: 'tank', name: 'Tank', type: 'unit' },
      ],
    })
    const support = { entryId: 'ancient', attachedTo: 3 }
    const host = { entryId: 'squad' }

    expect(attachmentErrors([support, { entryId: 'captain', attachedTo: 3 }, { entryId: 'tank' }, host], index)).toEqual([])
    expect(attachmentErrors([support, { entryId: 'captain' }, { entryId: 'tank' }, host], index)[0]?.message).toBe(
      'cannot support SQUAD without an attached Leader',
    )
    expect(attachmentErrors([support, { entryId: 'captain', attachedTo: 2 }, { entryId: 'tank' }, host], index)[0]?.message).toBe(
      'cannot support SQUAD without an attached Leader',
    )
  })

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

  it('says why a character the data never fields alone is illegal on its own', () => {
    // A Judiciar has no Leader ability of its own; the catalogue writes "must be
    // attached" as a minimum on `associations`, and says in the constraint which
    // units will take it.
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'judiciar',
          name: 'Judiciar',
          type: 'model',
          constraints: [
            {
              id: 'joined',
              type: 'min',
              value: 1,
              field: 'associations',
              scope: 'self',
              message: '{this} must be attached to a Bodyguard unit.',
            },
          ],
          infoGroups: [
            { id: 'g', name: 'Leader', profiles: [ability('Leader', 'This model can be attached to the following units:\n■ SQUAD')] },
          ],
        },
        { id: 'squad', name: 'SQUAD', type: 'unit' },
      ],
    })
    expect({
      alone: attachmentErrors([{ entryId: 'judiciar' }, { entryId: 'squad' }], index),
      joined: attachmentErrors([{ entryId: 'judiciar', attachedTo: 1 }, { entryId: 'squad' }], index),
    }).toEqual({
      alone: [{ entryId: 'judiciar', entryName: 'Judiciar', message: 'must be attached to a Bodyguard unit' }],
      joined: [],
    })
  })

  describe('a Support unit on its own', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          profiles: [ability('Leader', 'This model can be attached to the following units: SQUAD')],
        },
        {
          id: 'ancient',
          name: 'Ancient',
          type: 'model',
          profiles: [ability('Support', 'This model can be attached to the following units: SQUAD')],
        },
        { id: 'squad', name: 'SQUAD', type: 'unit' },
      ],
    })

    it('is illegal, because every Support unit joins a Bodyguard unit', () => {
      expect(attachmentErrors([{ entryId: 'ancient' }, { entryId: 'squad' }], index)).toEqual([
        { entryId: 'ancient', entryName: 'Ancient', message: 'must be attached to a Bodyguard unit' },
      ])
    })

    it('is legal once attached', () => {
      expect(attachmentErrors([{ entryId: 'ancient', attachedTo: 1 }, { entryId: 'squad' }], index)).toEqual([])
    })

    it('differs from a Leader, which may stand alone', () => {
      expect(attachmentErrors([{ entryId: 'captain' }, { entryId: 'squad' }], index)).toEqual([])
    })
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

  it('allows the number of leaders declared by the bodyguard', () => {
    const leader = (id: string, name: string) => ({
      id,
      name,
      type: 'model' as const,
      profiles: [ability('Leader', 'This model can be attached to the following unit: CADIAN SHOCK TROOPS')],
    })
    const index = indexOf({
      entryLinks: [{ id: 'shock-troops-link', name: 'Cadian Shock Troops', type: 'selectionEntry', targetId: 'shock-troops' }],
      sharedSelectionEntries: [
        leader('ursula-creed', 'Ursula Creed'),
        {
          ...leader('command-squad', 'Cadian Command Squad'),
          categoryLinks: [{ id: 'command-squad-link', targetId: 'command-squad-category', name: 'Command Squad' }],
        },
        leader('castellan', 'Cadian Castellan'),
        {
          id: 'shock-troops',
          name: 'Cadian Shock Troops',
          type: 'unit',
          constraints: [
            {
              id: 'leader-limit',
              childName: 'Leader',
              field: 'associations',
              scope: 'self',
              type: 'max',
              value: 2,
            },
            {
              id: 'command-squad-limit',
              childId: 'command-squad-category',
              childName: 'Command Squad',
              field: 'associations',
              scope: 'self',
              type: 'max',
              value: 1,
            },
          ],
        },
      ],
    })
    const twoLeaders = [
      { entryId: 'ursula-creed', attachedTo: 2 },
      { entryId: 'command-squad', attachedTo: 2 },
      { entryId: 'shock-troops-link' },
    ]

    expect(attachmentLimitsOf(index.definitions.get('shock-troops-link')!, index).leader).toBe(2)
    expect(attachmentErrors(twoLeaders, index)).toEqual([])
    expect(attachmentErrors([...twoLeaders, { entryId: 'castellan', attachedTo: 2 }], index)[0]?.message).toBe(
      'cannot lead Cadian Shock Troops, which already has 2 Leaders',
    )
    expect(
      attachmentErrors(
        [{ entryId: 'command-squad', attachedTo: 2 }, { entryId: 'command-squad', attachedTo: 2 }, { entryId: 'shock-troops-link' }],
        index,
      )[0]?.message,
    ).toBe('cannot be attached to Cadian Shock Troops, which already has 1 Command Squad')
  })

  describe('a character whose role depends on the army', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'cato',
          name: 'Cato Sicarius',
          type: 'model',
          profiles: [
            {
              ...ability('Support', 'This model can be attached to the following units: VICTRIX HONOUR GUARD'),
              modifiers: [
                {
                  field: 'name',
                  type: 'set',
                  value: 'Leader',
                  conditions: [{ childId: 'calgar-keyword', field: 'selections', scope: 'force', type: 'lessThan', value: 1 }],
                },
              ],
            },
          ],
        },
        {
          id: 'konorius',
          name: 'Kaius Konorius',
          type: 'model',
          profiles: [ability('Support', 'This model can be attached to the following units: VICTRIX HONOUR GUARD')],
        },
        { id: 'calgar', name: 'Marneus Calgar', type: 'model', categoryLinks: [{ id: 'calgar-link', targetId: 'calgar-keyword' }] },
        { id: 'victrix', name: 'VICTRIX HONOUR GUARD', type: 'unit' },
      ],
    })
    const together = [{ entryId: 'cato', attachedTo: 2 }, { entryId: 'konorius', attachedTo: 2 }, { entryId: 'victrix' }]

    it('leads beside a support unit when the army has no Marneus Calgar', () => {
      expect(attachmentErrors(together, index)).toEqual([])
    })

    it('supports once the army includes Marneus Calgar', () => {
      expect(attachmentErrors([...together, { entryId: 'calgar' }], index).map((error) => error.message)).toEqual([
        'cannot support VICTRIX HONOUR GUARD, which is already supported by Cato Sicarius',
      ])
    })
  })

  describe('a unit that takes a second leader at full strength', () => {
    const shaper = (id: string) => ({
      id,
      name: id,
      type: 'model' as const,
      profiles: [ability('Leader', 'This model can be attached to the following units: KROOT CARNIVORES')],
    })
    const index = indexOf({
      sharedSelectionEntries: [
        shaper('war-shaper'),
        shaper('flesh-shaper'),
        {
          id: 'carnivores',
          name: 'KROOT CARNIVORES',
          type: 'unit',
          constraints: [{ id: 'leader-limit', childName: 'Leader', field: 'associations', scope: 'self', type: 'max', value: 1 }],
          modifiers: [
            {
              field: 'leader-limit',
              type: 'increment',
              value: 1,
              conditions: [{ childId: 'model', field: 'selections', scope: 'self', type: 'atLeast', value: 20 }],
            },
          ],
          selectionEntries: [{ id: 'carnivore', name: 'Carnivore', type: 'model' }],
        },
      ],
    })
    const twoShapers = [{ entryId: 'war-shaper', attachedTo: 2 }, { entryId: 'flesh-shaper', attachedTo: 2 }, { entryId: 'carnivores' }]
    const fielding = (count: number) => [undefined, undefined, { id: 'carnivores', selections: [{ id: 'carnivore', count }] }]

    it('takes two leaders at twenty models', () => {
      expect(attachmentErrors(twoShapers, index, fielding(20))).toEqual([])
    })

    it('takes one leader below twenty models', () => {
      expect(attachmentErrors(twoShapers, index, fielding(10)).map((error) => error.message)).toEqual([
        'cannot lead KROOT CARNIVORES, which is already led by war-shaper',
      ])
    })
  })

  describe('a unit whose second leader takes a pair or alternatives', () => {
    const leader = (id: string) => ({
      id,
      name: id,
      type: 'model' as const,
      profiles: [ability('Leader', 'This model can be attached to the following units: GUARDIAN DEFENDERS')],
    })
    const attached = (childId: string) => ({ childId, field: 'associations', scope: 'self', type: 'atLeast' as const, value: 1 })
    const index = indexOf({
      sharedSelectionEntries: [
        leader('visarch'),
        leader('yvraine'),
        leader('farseer'),
        leader('autarch'),
        {
          id: 'conclave',
          name: 'conclave',
          type: 'model' as const,
          profiles: [ability('Support', 'This unit can be attached to the following units: GUARDIAN DEFENDERS')],
        },
        {
          id: 'guardians',
          name: 'GUARDIAN DEFENDERS',
          type: 'unit',
          constraints: [{ id: 'leader-limit', childName: 'Leader', field: 'associations', scope: 'self', type: 'max', value: 1 }],
          modifiers: [
            {
              field: 'leader-limit',
              type: 'increment',
              value: 1,
              conditionGroups: [
                {
                  type: 'or',
                  conditions: [attached('conclave')],
                  conditionGroups: [{ type: 'and', conditions: [attached('visarch'), attached('yvraine')] }],
                },
              ],
            },
          ],
        },
      ],
    })
    const messages = (first: string, second: string) =>
      attachmentErrors([{ entryId: first, attachedTo: 2 }, { entryId: second, attachedTo: 2 }, { entryId: 'guardians' }], index).map(
        (error) => error.message,
      )

    it('takes both of a pair', () => {
      expect(messages('visarch', 'yvraine')).toEqual([])
    })

    it('takes a second leader beside the alternative listed after both leaders, as the official app lists support last', () => {
      const units = [
        { entryId: 'farseer', attachedTo: 3 },
        { entryId: 'autarch', attachedTo: 3 },
        { entryId: 'conclave', attachedTo: 3 },
        { entryId: 'guardians' },
      ]
      expect(attachmentErrors(units, index)).toEqual([])
    })

    it('refuses half a pair beside another leader', () => {
      expect(messages('visarch', 'farseer')).toEqual(['cannot lead GUARDIAN DEFENDERS, which is already led by visarch'])
    })
  })

  describe('a leader that joins a unit already led', () => {
    const leader = (id: string, name: string, categoryLinks?: { id: string; targetId: string; name: string }[]) => ({
      id,
      name,
      type: 'model' as const,
      ...(categoryLinks ? { categoryLinks } : {}),
      profiles: [ability('Leader', 'This model can be attached to the following units: POXWALKERS, PLAGUE MARINES')],
    })
    const raisedBy = (childId: string) => ({
      id: 'poxwalkers',
      name: 'POXWALKERS',
      type: 'unit' as const,
      constraints: [{ id: 'leader-limit', childName: 'Leader', field: 'associations', scope: 'self', type: 'max' as const, value: 1 }],
      modifiers: [
        {
          field: 'leader-limit',
          type: 'set' as const,
          value: 2,
          conditions: [{ childId, field: 'associations', scope: 'self', type: 'atLeast' as const, value: 1 }],
        },
      ],
    })
    const index = indexOf({
      sharedSelectionEntries: [
        leader('typhus', 'Typhus'),
        leader('blightbringer', 'Noxious Blightbringer', [
          { id: 'blightbringer-category-link', targetId: 'blightbringer-category', name: 'Noxious Blightbringer' },
        ]),
        leader('plaguecaster', 'Malignant Plaguecaster'),
        raisedBy('blightbringer'),
        { ...raisedBy('blightbringer-category'), id: 'plague-marines', name: 'PLAGUE MARINES' },
      ],
    })
    const messages = (units: { entryId: string; attachedTo?: number }[]) =>
      attachmentErrors(units, index).map((error) => `${error.entryName}: ${error.message}`)

    it('takes a second leader beside it', () => {
      expect(
        messages([{ entryId: 'typhus', attachedTo: 2 }, { entryId: 'blightbringer', attachedTo: 2 }, { entryId: 'poxwalkers' }]),
      ).toEqual([])
    })

    it('takes a second leader before it', () => {
      expect(
        messages([{ entryId: 'blightbringer', attachedTo: 2 }, { entryId: 'typhus', attachedTo: 2 }, { entryId: 'poxwalkers' }]),
      ).toEqual([])
    })

    it('is named by its keyword too', () => {
      const units = [{ entryId: 'typhus', attachedTo: 2 }, { entryId: 'blightbringer', attachedTo: 2 }, { entryId: 'plague-marines' }]
      expect(attachmentErrors(units, index)).toEqual([])
    })

    it('leaves two other leaders refused', () => {
      expect(
        messages([{ entryId: 'typhus', attachedTo: 2 }, { entryId: 'plaguecaster', attachedTo: 2 }, { entryId: 'poxwalkers' }]),
      ).toEqual(['Malignant Plaguecaster: cannot lead POXWALKERS, which is already led by Typhus'])
    })

    it('cannot join beside another of itself', () => {
      expect(
        messages([{ entryId: 'blightbringer', attachedTo: 2 }, { entryId: 'blightbringer', attachedTo: 2 }, { entryId: 'poxwalkers' }]),
      ).toEqual(['Noxious Blightbringer: cannot lead POXWALKERS, which is already led by Noxious Blightbringer'])
    })

    it('makes room for only one more', () => {
      expect(
        messages([
          { entryId: 'typhus', attachedTo: 3 },
          { entryId: 'blightbringer', attachedTo: 3 },
          { entryId: 'plaguecaster', attachedTo: 3 },
          { entryId: 'poxwalkers' },
        ]),
      ).toEqual(['Malignant Plaguecaster: cannot lead POXWALKERS, which already has 2 Leaders'])
    })
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
      { entryId: 'apothecary', attachedTo: 5 },
      { entryId: 'squad' },
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

  // A Loyal Protector joins a Command Squad, which can then lead its bodyguard unit.
  const protected_ = [{}, { attachedTo: 0 }, { attachedTo: 1 }]

  it('counts a character joined to an attached character with the whole unit', () => {
    expect(attachedUnit(protected_, 2)).toEqual([0, 1])
  })

  it('counts a character joined to an attached character from the bodyguard', () => {
    expect(attachedUnit(protected_, 0)).toEqual([1, 2])
  })
})

describe('a datasheet VS Data records the hosts of', () => {
  const lord = ability('Leader', 'This model can be attached to the following units:\n■ CHOSEN\n■ CULTIST MOB')
  const index = {
    ...indexOf({
      sharedSelectionEntries: [
        { id: 'lord', name: 'Chaos Lord', type: 'model', infoGroups: [{ id: 'g', name: 'Leader', profiles: [lord] }] },
        { id: 'chosen', name: 'Chosen', type: 'unit' },
        { id: 'cultists', name: 'Cultist Mob', type: 'unit' },
        { id: 'terminators', name: 'Chaos Terminator Squad', type: 'unit' },
      ],
    }),
    attachments: {
      lord: {
        kind: 'leader' as const,
        targets: ['Chaos Terminator Squad'],
        conditional: [
          { kind: 'leader' as const, targets: ['Chosen'], excludes: ['pactbound'] },
          { kind: 'leader' as const, targets: ['Chosen'], requires: [['pactbound']], shared: 'KHORNE' },
        ],
        named: ['Chaos Terminator Squad', 'Chosen'],
      },
    },
  }
  const leading = (host: string) => [{ entryId: 'lord', attachedTo: 1 }, { entryId: host }]
  const messages = (host: string, keywords: (string[] | undefined)[] = [], detachments: string[] = []) =>
    attachmentErrors(leading(host), index, [], keywords, detachments).map((error) => error.message)

  it('joins a host VS Data adds', () => {
    expect(messages('terminators')).toEqual([])
  })

  it('joins a host only the catalogue names', () => {
    expect(messages('cultists')).toEqual([])
  })

  it('joins a host outside the Detachment that limits it', () => {
    expect(messages('chosen', [[], []])).toEqual([])
  })

  it('refuses a host in the Detachment without the keyword both must hold', () => {
    expect(messages('chosen', [['Khorne'], ['Nurgle']], ['pactbound'])).toEqual(['cannot be attached to Chosen'])
  })

  it('joins a host in the Detachment that holds the keyword it holds', () => {
    expect(messages('chosen', [['Khorne'], ['Khorne']], ['pactbound'])).toEqual([])
  })

  it('does not refuse a host for keywords no one knows', () => {
    expect(messages('chosen', [], ['pactbound'])).toEqual([])
  })

  it('shows every host some army lets it join', () => {
    expect(referenceAttachmentOf(index.definitions.get('lord')!, index)?.targets).toEqual([
      'CULTIST MOB',
      'Chaos Terminator Squad',
      'Chosen',
    ])
  })
})

describe('a datasheet VS Data gives a role only in some armies', () => {
  const index = {
    ...indexOf({
      sharedSelectionEntries: [
        { id: 'cato', name: 'Cato Sicarius', type: 'model' },
        { id: 'calgar', name: 'Marneus Calgar', type: 'model' },
        { id: 'victrix', name: 'Victrix Honour Guard', type: 'unit' },
        {
          id: 'lieutenant',
          name: 'Lieutenant',
          type: 'model',
          profiles: [ability('Leader', 'This model can be attached to the following units: VICTRIX HONOUR GUARD')],
        },
      ],
    }),
    attachments: {
      cato: {
        targets: [],
        conditional: [
          { kind: 'support' as const, targets: ['Victrix Honour Guard'], requires: [['calgar']] },
          { kind: 'leader' as const, targets: ['Victrix Honour Guard'], excludes: ['calgar'] },
        ],
        named: ['Victrix Honour Guard'],
      },
    },
  }
  const beside = [{ entryId: 'cato', attachedTo: 1 }, { entryId: 'victrix' }, { entryId: 'lieutenant', attachedTo: 1 }]

  it('supports beside the unit its support waits on', () => {
    expect(attachmentErrors([...beside, { entryId: 'calgar' }], index)).toEqual([])
  })

  it('leads without it', () => {
    expect(attachmentErrors(beside, index).map((error) => error.message)).toEqual([
      'cannot lead Victrix Honour Guard, which is already led by Cato Sicarius',
    ])
  })
})

it("takes VS Data's role over the catalogue's", () => {
  const index = {
    ...indexOf({
      sharedSelectionEntries: [
        {
          id: 'priest',
          name: 'Sanguinary Priest',
          type: 'model',
          profiles: [ability('Support', 'This model can be attached to the following unit:\n■ ASSAULT SQUAD')],
        },
      ],
    }),
    attachments: { priest: { kind: 'leader' as const, targets: ['Assault Squad'], named: ['Assault Squad'] } },
  }
  expect(attachmentOf(index.definitions.get('priest')!, index)?.kind).toBe('leader')
})

describe('a joiner VS Data has a record for', () => {
  const captain = (vsData: Record<string, unknown>) => {
    const index = {
      ...indexOf({
        sharedSelectionEntries: [
          {
            id: 'captain',
            name: 'Captain',
            type: 'model',
            profiles: [ability('Leader', 'This model can be attached to the following units:\n■ TACTICAL SQUAD\n■ ASSAULT SQUAD')],
          },
        ],
      }),
      attachments: { captain: { kind: 'leader' as const, targets: ['Intercessor Squad'], named: ['Intercessor Squad'], ...vsData } },
      attachmentHosts: ['Intercessor Squad', 'Assault Squad'],
    }
    return attachmentOf(index.definitions.get('captain')!, index)?.targets
  }

  it("leaves out a host VS Data defines but does not name for it, and keeps the catalogue's others", () => {
    expect(captain({})).toEqual(['TACTICAL SQUAD', 'Intercessor Squad'])
  })

  it("keeps the catalogue's reading of the hosts VS Data is not settled on for a joiner", () => {
    expect(captain({ catalogueHosts: ['Assault Squad'] })).toEqual(['TACTICAL SQUAD', 'ASSAULT SQUAD', 'Intercessor Squad'])
  })

  it("keeps the catalogue's hosts for a joiner whose VS Data hosts are not settled", () => {
    expect(captain({ catalogueHosts: true })).toEqual(['TACTICAL SQUAD', 'ASSAULT SQUAD', 'Intercessor Squad'])
  })
})

describe("VS Data's attachment rules", () => {
  const unit = (id: string, name: string) => ({ id, name, type: 'unit' as const })
  const index = {
    ...indexOf({
      sharedSelectionEntries: [
        unit('cryptek', 'Cryptek'),
        unit('overlord', 'Overlord'),
        unit('warriors', 'Necron Warriors'),
        unit('thralls', 'Cryptothralls'),
        unit('crawlers', 'Canoptek Tomb Crawlers'),
        unit('bearer', 'Icon Bearer'),
        unit('marines', 'Plague Marines'),
        unit('carnivores', 'Kroot Carnivores'),
        unit('shaper', 'Trail Shaper'),
        unit('shocks', 'Cadian Shock Troops'),
        unit('command', 'Cadian Command Squad'),
        unit('castellan', 'Cadian Castellan'),
      ],
    }),
    attachments: {
      cryptek: { kind: 'support' as const, targets: ['Necron Warriors'], named: ['Necron Warriors'] },
      overlord: { kind: 'leader' as const, targets: ['Necron Warriors', 'Plague Marines'], named: ['Necron Warriors', 'Plague Marines'] },
      thralls: { targets: [], named: [], joins: [{ anyHost: true as const, ledBy: ['CRYPTEK'], exclusive: ['CRYPTOTHRALLS'] }] },
      crawlers: { targets: [], named: [], joins: [{ anyHost: true as const, ledBy: ['CRYPTEK'], exclusive: ['CRYPTOTHRALLS'] }] },
      bearer: {
        kind: 'leader' as const,
        targets: ['Plague Marines'],
        named: ['Plague Marines'],
        besideAnother: [{ targets: ['Plague Marines'], besideKeywords: ['CHARACTER'] }],
      },
      shaper: { kind: 'leader' as const, targets: ['Kroot Carnivores'], named: ['Kroot Carnivores'] },
      carnivores: { targets: [], named: [], capacity: { leader: 2, distinct: true as const } },
      command: { kind: 'leader' as const, targets: ['Cadian Shock Troops'], named: ['Cadian Shock Troops'] },
      castellan: { kind: 'leader' as const, targets: ['Cadian Shock Troops'], named: ['Cadian Shock Troops'] },
      shocks: { targets: [], named: [], capacity: { leader: 2, limits: [{ keywords: ['COMMAND SQUAD'], maximum: 1 }] } },
    },
  }
  const messages = (units: { entryId: string; attachedTo?: number }[], keywords: Record<string, string[]> = {}) =>
    attachmentErrors(
      units,
      index,
      [],
      units.map((entry) => keywords[entry.entryId]),
    ).map((error) => `${error.entryName}: ${error.message}`)
  const at = (entryId: string, host?: number) => ({ entryId, ...(host === undefined ? {} : { attachedTo: host }) })

  it('lets a unit join any unit the character its rule names is attached to', () => {
    expect(messages([at('warriors'), at('cryptek', 0), at('thralls', 0)], { cryptek: ['Cryptek'] })).toEqual([])
  })

  it('refuses a joining unit without the leader it needs', () => {
    expect(messages([at('warriors'), at('overlord', 0), at('thralls', 0)], { overlord: ['Overlord'] })).toEqual([
      'Cryptothralls: cannot join Necron Warriors without the character it needs',
    ])
  })

  it('refuses a second unit an exclusive join shuts out', () => {
    expect(
      messages([at('warriors'), at('cryptek', 0), at('thralls', 0), at('crawlers', 0)], {
        cryptek: ['Cryptek'],
        thralls: ['Cryptothralls'],
        crawlers: ['Tomb Crawlers'],
      }),
    ).toEqual(['Canoptek Tomb Crawlers: cannot join Necron Warriors, which Cryptothralls has already joined'])
  })

  it('refuses a joining unit an earlier join shuts out', () => {
    expect(
      messages([at('warriors'), at('cryptek', 0), at('crawlers', 0), at('thralls', 0)], {
        cryptek: ['Cryptek'],
        thralls: ['Cryptothralls'],
        crawlers: ['Tomb Crawlers'],
      }),
    ).toEqual(['Cryptothralls: cannot join Necron Warriors, which Canoptek Tomb Crawlers has already joined'])
  })

  it('does not ask a joining unit with nothing to join to be attached', () => {
    expect(messages([at('thralls')])).toEqual([])
  })

  it('lets a leader lead beside another leader of the keyword it names', () => {
    expect(messages([at('marines'), at('overlord', 0), at('bearer', 0)], { overlord: ['Character'], bearer: ['Character'] })).toEqual([])
  })

  it('refuses a leader beside another leader without the keyword it names', () => {
    expect(messages([at('marines'), at('overlord', 0), at('bearer', 0)], { overlord: ['Monster'], bearer: ['Character'] })).toEqual([
      'Icon Bearer: cannot lead Plague Marines, which is already led by Overlord',
    ])
  })

  it("takes the leaders a bodyguard's capacity allows", () => {
    expect(
      messages([at('shocks'), at('command', 0), at('castellan', 0)], { command: ['Command Squad'], castellan: ['Character'] }),
    ).toEqual([])
  })

  it('refuses more attached units of a keyword than its capacity allows', () => {
    expect(messages([at('shocks'), at('command', 0), at('command', 0)], { command: ['Command Squad'] }).at(-1)).toBe(
      'Cadian Command Squad: cannot be attached to Cadian Shock Troops, which already has 1 Command Squad',
    )
  })

  it('refuses two of the same leader where its capacity takes only distinct ones', () => {
    expect(messages([at('carnivores'), at('shaper', 0), at('shaper', 0)])).toEqual([
      'Trail Shaper: cannot lead Kroot Carnivores, which is already led by Trail Shaper',
    ])
  })
})
