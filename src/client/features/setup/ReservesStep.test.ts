import { describe, expect, it } from 'vitest'
import type { Army } from '../../sides'
import { reserveSections } from './reservesModel'

const unit = (
  key: string,
  name: string,
  group: Army['units'][number]['group'],
  deepStrike = false,
  attachedTo?: string,
): Army['units'][number] => ({
  key,
  name,
  group,
  ...(attachedTo === undefined ? {} : { attachedTo }),
  points: 100,
  models: 1,
  alive: 1,
  destroyed: false,
  deployed: true,
  formation: 'battlefield',
  formationOptions: deepStrike ? ['deep-strike'] : [],
  damage: 0,
})

describe('reserve sections', () => {
  it('lists deep strike units first and every other unit in strategic reserves', () => {
    const sections = reserveSections([
      unit('tank', 'Tank', 'vehicle'),
      unit('jumper', 'Jumper', 'infantry', true),
      unit('leader', 'Leader', 'character'),
      unit('winged', 'Winged', 'monster', true),
    ])

    expect(sections.map((section) => [section.label, section.units.map((entry) => entry.host.name)])).toEqual([
      ['Deep strike', ['Jumper', 'Winged']],
      ['Strategic reserves', ['Leader', 'Tank']],
    ])
  })

  it('lists a character with the unit they joined, on that unit’s shelf', () => {
    const sections = reserveSections([
      unit('marines', 'Plague Marines', 'battleline'),
      unit('lord', 'Lord of Contagion', 'character', true, 'marines'),
    ])

    expect(sections.map((section) => [section.label, section.units.map((entry) => entry.host.name)])).toEqual([
      ['Strategic reserves', ['Plague Marines']],
    ])
  })

  it('names the character standing with the unit they joined', () => {
    const sections = reserveSections([
      unit('terminators', 'Deathshroud Terminators', 'infantry', true),
      unit('lord', 'Lord of Contagion', 'character', true, 'terminators'),
    ])

    expect(sections[0]?.units[0]?.joined.map((entry) => entry.name)).toEqual(['Lord of Contagion'])
  })

  it('offers deep strike only when the unit a character joined can make it too', () => {
    const sections = reserveSections([
      unit('terminators', 'Deathshroud Terminators', 'infantry', true),
      unit('lord', 'Lord of Contagion', 'character', true, 'terminators'),
    ])

    expect(sections.map((section) => section.label)).toEqual(['Deep strike'])
  })
})
