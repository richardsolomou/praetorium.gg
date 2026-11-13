import { expect, it } from 'vitest'
import { datasheetFixture } from './datasheet.fixtures'
import { unitMove, unitRange } from './unitReach'

const sheet = (move: string, ...weapons: { type: string; range: string; count?: number }[]) =>
  datasheetFixture({
    profiles: [
      { id: move, name: 'Model', type: 'Unit', values: [{ name: 'M', value: move }] },
      ...weapons.map(({ type, range, count }, index) => ({
        id: `${move}-${index}`,
        name: `Weapon ${index}`,
        type,
        ...(count === undefined ? {} : { count }),
        values: [{ name: 'Range', value: range }],
      })),
    ],
  })

it('limits movement by the slowest model in the attached unit', () => {
  expect(unitMove({ sheet: sheet('10"'), companions: [{ sheet: sheet('6"') }] })).toBe(6)
})

it('reads the longest ranged weapon the unit or its attachments carry', () => {
  const squad = sheet('6"', { type: 'Ranged Weapons', range: '24"' }, { type: 'Melee Weapons', range: 'Melee' })
  const leader = sheet('6"', { type: 'Ranged Weapons', range: '36"', count: 0 }, { type: 'Ranged Weapons', range: '18"' })
  expect(unitRange({ sheet: squad, companions: [{ sheet: leader }] })).toBe(24)
  expect(unitRange({ sheet: sheet('8"', { type: 'Melee Weapons', range: 'Melee' }) })).toBeNull()
})
