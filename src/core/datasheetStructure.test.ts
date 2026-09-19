import { describe, expect, it } from 'vitest'
import { datasheetCharacteristicKind, datasheetProfileKind, structureDatasheetProfiles } from './datasheetStructure'

describe('datasheet structure', () => {
  it.each([
    ['Unit', 'unit'],
    ['Ranged Weapons', 'ranged-weapon'],
    ['melee-weapons', 'melee-weapon'],
    ['Transport', 'transport'],
    ['Abilities', 'rule'],
    ['Orders', 'other'],
  ] as const)('classifies the %s profile as %s', (source, expected) => {
    expect(datasheetProfileKind(source)).toBe(expected)
  })

  it.each([
    ['M', 'movement'],
    ['Objective Control', 'objective-control'],
    ['InSv', 'invulnerable-save'],
    ['BS', 'ballistic-skill'],
    ['AP', 'armour-penetration'],
    ['Keywords', 'keywords'],
  ] as const)('classifies the %s characteristic as %s', (source, expected) => {
    expect(datasheetCharacteristicKind(source)).toBe(expected)
  })

  it('keeps an unfamiliar characteristic visible and marks it as unknown', () => {
    expect(datasheetCharacteristicKind('Future stat')).toBe('other')
  })

  it('adds semantic kinds without replacing source labels', () => {
    expect(
      structureDatasheetProfiles([{ id: 'weapon', name: 'Rifle', type: 'Ranged Weapons', values: [{ name: 'A', value: '2' }] }]),
    ).toEqual([
      {
        id: 'weapon',
        name: 'Rifle',
        type: 'Ranged Weapons',
        kind: 'ranged-weapon',
        values: [{ name: 'A', value: '2', kind: 'attacks' }],
      },
    ])
  })
})
