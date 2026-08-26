import { describe, expect, it } from 'vitest'
import type { Army } from '../../sides'
import { reserveSections } from './reservesModel'

const unit = (key: string, name: string, group: Army['units'][number]['group'], deepStrike = false): Army['units'][number] => ({
  key,
  name,
  group,
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

    expect(sections.map((section) => [section.label, section.units.map((entry) => entry.name)])).toEqual([
      ['Deep strike', ['Jumper', 'Winged']],
      ['Strategic reserves', ['Leader', 'Tank']],
    ])
  })
})
