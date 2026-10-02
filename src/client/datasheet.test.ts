import { describe, expect, it } from 'vitest'
import {
  addedKeywords,
  attachmentGroups,
  compositionCount,
  datasheetPoints,
  unitCostsSummary,
  datasheetDescription,
  primaryUnitProfile,
  profileTableColumns,
  profileTableValue,
  referenceAbilities,
  ruleProfileSections,
  weaponProfileGroups,
  weaponProfileMode,
} from './datasheet'

describe('datasheet search description', () => {
  it('answers points and base-size searches from printed facts', () => {
    expect(datasheetDescription({ name: 'Enginseer', points: 55, costs: [], baseSize: '32mm' }, 'Adeptus Mechanicus')).toBe(
      'Enginseer datasheet for Adeptus Mechanicus. 55 points. Base size: 32mm. Profiles, weapons, abilities and wargear.',
    )
  })

  it('states every unconditional unit size in place of the single points value', () => {
    const costs = [
      { models: '10', cost: '90', keyword: null, faction: null, detachment: null },
      { models: '20', cost: '180', keyword: null, faction: null, detachment: null },
    ]
    expect(datasheetDescription({ name: 'Boyz', points: 90, costs, baseSize: '32mm' }, 'Orks')).toBe(
      'Boyz datasheet for Orks. 10 models for 90 pts, 20 models for 180 pts. Base size: 32mm. Profiles, weapons, abilities and wargear.',
    )
  })

  it('does not invent unavailable points or base sizes', () => {
    expect(datasheetDescription({ name: 'Enginseer', points: null, costs: [], baseSize: null }, 'Adeptus Mechanicus')).toBe(
      'Enginseer datasheet for Adeptus Mechanicus. Profiles, weapons, abilities and wargear.',
    )
  })

  it('leaves multi-model base details on the page instead of crowding the snippet', () => {
    expect(
      datasheetDescription({ name: 'Command Squad', points: null, costs: [], baseSize: 'Captain: 40mm\nRetinue: 32mm' }, 'Space Marines'),
    ).toBe('Command Squad datasheet for Space Marines. Profiles, weapons, abilities and wargear.')
  })
})

describe('primary unit profile', () => {
  const profile = (id: string, name: string, type = 'Unit') => ({ id, name, type, values: [] })

  it('uses the profile named after the datasheet instead of an optional model listed first', () => {
    const outrider = profile('outrider', 'Outrider Squad')

    expect(
      primaryUnitProfile({
        name: 'Outrider Squad',
        profiles: [profile('atv', 'Invader ATV'), outrider, profile('sergeant', 'Outrider Sergeant')],
      }),
    ).toBe(outrider)
  })

  it('matches a singular primary model after an optional model', () => {
    const guardian = profile('guardian', 'Storm Guardian')

    expect(
      primaryUnitProfile({
        name: 'Storm Guardians',
        profiles: [profile('platform', "Serpent's Scale Platform"), guardian],
      }),
    ).toBe(guardian)
  })

  it('prefers an exact profile over an earlier singular profile', () => {
    const guardians = profile('guardians', 'Storm Guardians')

    expect(
      primaryUnitProfile({
        name: 'Storm Guardians',
        profiles: [profile('guardian', 'Storm Guardian'), guardians],
      }),
    ).toBe(guardians)
  })

  it('falls back to the first unit profile when none matches the datasheet name', () => {
    const champion = profile('champion', 'Aspiring Champion')

    expect(
      primaryUnitProfile({
        name: 'Chosen',
        profiles: [profile('weapon', 'Boltgun', 'Ranged Weapons'), champion, profile('chosen', 'Chosen Warrior')],
      }),
    ).toBe(champion)
  })

  it('uses the canonical profile kind instead of inferring behavior from its label', () => {
    const commander = { ...profile('commander', 'Commander', 'Orders'), kind: 'unit' as const }

    expect(primaryUnitProfile({ name: 'Commander', profiles: [commander] })).toBe(commander)
  })
})

describe('datasheet profile tables', () => {
  const profiles = [
    { id: 'one', name: 'One', type: 'Unit', values: [{ name: 'M', value: '6"', kind: 'movement' as const }] },
    { id: 'two', name: 'Two', type: 'Unit', values: [{ name: 'Movement', value: '5"', kind: 'movement' as const }] },
  ]

  it('uses one column for different labels with the same semantic kind', () => {
    expect(profileTableColumns(profiles)).toEqual([{ key: 'movement', characteristic: profiles[0]!.values[0] }])
  })

  it('finds a row value through its semantic column', () => {
    expect(profileTableValue(profiles[1]!, profileTableColumns(profiles)[0]!)).toBe(profiles[1]!.values[0])
  })
})

describe('datasheet composition count', () => {
  it('adds fixed and ranged model groups', () => {
    expect(compositionCount(['**1 Deathwing Sergeant**', '**4-9 Deathwing Terminators**'])).toBe('5–10 models')
  })

  it('reads a range the source wrote with a non-breaking hyphen', () => {
    expect(compositionCount(['1-2 Nob models', '9\u201118 Beast Snagga Boy models'])).toBe('10\u201320 models')
  })

  it('keeps a single-model datasheet singular', () => {
    expect(compositionCount(['**1 Overlord**'])).toBe('1 model')
  })

  it('totals each fixed composition without adding alternatives together', () => {
    expect(
      compositionCount(['**1 Shock Trooper Sergeant and 9 Shock Troopers**', 'OR', '**2 Shock Trooper Sergeants and 18 Shock Troopers**']),
    ).toBe('10–20 models')
  })
})

describe('datasheet unit costs summary', () => {
  const cost = (models: string, points: string, condition: Partial<{ keyword: string; faction: string; detachment: string }> = {}) => ({
    models,
    cost: points,
    keyword: null,
    faction: null,
    detachment: null,
    ...condition,
  })

  it('states a single model in the singular', () => {
    expect(unitCostsSummary([cost('1', '60')])).toBe('1 model for 60 pts')
  })

  it('lists several unit sizes smallest first', () => {
    expect(unitCostsSummary([cost('10', '210'), cost('5', '105')])).toBe('5 models for 105 pts, 10 models for 210 pts')
  })

  it('leaves out a cost that depends on a detachment', () => {
    expect(unitCostsSummary([cost('5', '105'), cost('5', '90', { detachment: 'Gladius' })])).toBe('5 models for 105 pts')
  })

  it('states nothing when every cost has a condition', () => {
    expect(unitCostsSummary([cost('1', '60', { keyword: 'Epic Hero' })])).toBeNull()
  })
})

describe('datasheet points', () => {
  const cost = (models: string, points: string, detachment: string | null = null) => ({
    models,
    cost: points,
    keyword: null,
    faction: null,
    detachment,
  })

  it('states one unit size as one figure', () => {
    expect(datasheetPoints({ points: 80, costs: [cost('1', '80')] })).toBe('80 pts')
  })

  it('states several unit sizes as the range they span', () => {
    expect(datasheetPoints({ points: 80, costs: [cost('10', '160'), cost('5', '80')] })).toBe('80–160 pts')
  })

  it('leaves out a cost that depends on a detachment', () => {
    expect(datasheetPoints({ points: 80, costs: [cost('5', '80'), cost('5', '60', 'Gladius')] })).toBe('80 pts')
  })

  it("falls back to the sheet's points when it prints no sizes", () => {
    expect(datasheetPoints({ points: 55, costs: [] })).toBe('55 pts')
  })

  it('states nothing when every cost has a condition', () => {
    expect(datasheetPoints({ points: null, costs: [cost('5', '60', 'Gladius')] })).toBeNull()
  })

  it('states nothing for a cost that is not a number', () => {
    expect(datasheetPoints({ points: 80, costs: [cost('5', '80'), cost('10', 'varies')] })).toBeNull()
  })
})

it('groups rule profiles by their catalogue type', () => {
  const orders = {
    id: 'orders',
    name: 'Orders',
    type: 'Orders',
    values: [{ name: 'Orders', value: 'This Officer can issue 2 Orders.' }],
  }
  const doctrine = {
    id: 'doctrine',
    name: 'Decisive Command',
    type: 'Hero of Hades Hive',
    values: [{ name: 'Description', value: 'Issue one Order.' }],
  }
  expect(
    ruleProfileSections([{ id: 'unit', name: 'Commander', type: 'Unit', values: [{ name: 'M', value: '10"' }] }, orders, doctrine]),
  ).toEqual([
    { title: 'Orders', profiles: [orders] },
    { title: 'Hero of Hades Hive', profiles: [doctrine] },
  ])
})

describe('datasheet abilities', () => {
  it('keeps attachment keywords on reference datasheets without repeating their rules', () => {
    const abilities = [
      { name: 'Leader', kind: 'core' },
      { name: 'Leader', kind: 'rule' },
      { name: 'Support', kind: 'core' },
      { name: 'Support', kind: 'rule' },
      { name: 'My Will Be Done', kind: 'datasheet' },
    ]

    expect(referenceAbilities(abilities, [{ kind: 'leader' }, { kind: 'support' }])).toEqual([abilities[0], abilities[2], abilities[4]])
  })

  it('keeps an attachment rule when the datasheet has no parsed targets', () => {
    const abilities = [{ name: 'Leader', kind: 'rule' }]

    expect(referenceAbilities(abilities, [])).toEqual(abilities)
  })

  it('groups every attachment direction in display order', () => {
    const leader = { name: 'Leader target', entryId: 'leader-target', route: null }
    const support = { name: 'Support target', entryId: 'support-target', route: null }
    const led = { name: 'Attached leader', entryId: 'attached-leader', route: null }
    const supported = { name: 'Attached support', entryId: 'attached-support', route: null }

    expect(
      attachmentGroups({
        attachments: [
          { ...leader, kind: 'leader' },
          { ...support, kind: 'support' },
        ],
        leaders: [led],
        supporters: [supported],
      }),
    ).toEqual([
      { title: 'Can lead', relationships: [{ ...leader, kind: 'leader' }] },
      { title: 'Can support', relationships: [{ ...support, kind: 'support' }] },
      { title: 'Can be led by', relationships: [led] },
      { title: 'Can be supported by', relationships: [supported] },
    ])
  })
})

describe('the keywords something in the list added to a weapon', () => {
  it('names a keyword added to a blank printed characteristic', () => {
    expect(addedKeywords({ value: 'Lethal Hits', baseValue: '' })).toEqual(['Lethal Hits'])
  })

  it('names what the printed profile does not have', () => {
    expect(addedKeywords({ value: 'Lethal Hits, Assault', baseValue: 'Lethal Hits' })).toEqual(['Assault'])
  })

  it('names nothing on an unmodified profile', () => {
    expect(addedKeywords({ value: 'Lethal Hits' })).toEqual([])
  })

  it('reads a non-breaking space as the separator the catalogue joined with', () => {
    expect(addedKeywords({ value: 'Lethal Hits,\u00a0Assault', baseValue: 'Lethal Hits' })).toEqual(['Assault'])
  })
})

it('keeps weapons with different attack types or carried counts in separate profile groups', () => {
  const profiles = [
    { id: 'focused', name: '➤ Blaster - Focused', type: 'Ranged Weapons', count: 1, values: [] },
    { id: 'dispersed', name: '➤ Blaster - Dispersed', type: 'Ranged Weapons', count: 1, values: [] },
    { id: 'melee', name: 'Blaster (Strike)', type: 'Melee Weapons', count: 1, values: [] },
    { id: 'pair', name: '➤ Blaster - Focused', type: 'Ranged Weapons', count: 2, values: [] },
    { id: 'other', name: 'Heavy blaster', type: 'Ranged Weapons', count: 1, values: [] },
  ]
  expect(weaponProfileGroups(profiles).map((group) => group.map((profile) => profile.id))).toEqual([
    ['focused', 'dispersed'],
    ['melee'],
    ['pair'],
    ['other'],
  ])
})

describe('weapon profile mode labels', () => {
  const profile = (name: string) => ({ id: name, name, type: 'Melee Weapons', values: [] })

  it('capitalizes a lowercase source mode', () => {
    expect(weaponProfileMode(profile('➤ Spear of the Void Dragon - strike'))).toBe('Strike')
  })

  it('preserves source modes that already have deliberate casing', () => {
    expect(weaponProfileMode(profile('➤ Blaster - FOCUSED'))).toBe('FOCUSED')
  })
})
