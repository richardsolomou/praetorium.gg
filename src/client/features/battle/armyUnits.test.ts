import { describe, expect, it } from 'vitest'
import type { UnitState } from '../../../core/battle'
import { armyShelves } from './armyUnits'

const unit = (overrides: Partial<UnitState> & Pick<UnitState, 'key'>): UnitState => ({
  name: overrides.key,
  points: 100,
  models: 5,
  destroyed: false,
  deployed: true,
  formation: 'battlefield',
  alive: overrides.models ?? 5,
  damage: 0,
  ...overrides,
})

describe('armyShelves', () => {
  it('reads the army on the shelves a roster is read by, in that order', () => {
    const units = [unit({ key: 'a', group: 'vehicle' }), unit({ key: 'b', group: 'character' })]
    expect(armyShelves(units, true).map((shelf) => shelf.id)).toEqual(['character', 'vehicle'])
  })

  it('omits a shelf nothing is left on', () => {
    expect(armyShelves([unit({ key: 'a', group: 'vehicle' })], true).map((shelf) => shelf.plural)).toEqual(['Vehicles'])
  })

  it('takes a destroyed unit off its shelf', () => {
    const units = [unit({ key: 'a', group: 'vehicle' }), unit({ key: 'b', group: 'vehicle', destroyed: true, alive: 0 })]
    expect(armyShelves(units, true).flatMap((shelf) => shelf.entries.flat().map((entry) => entry.key))).toEqual(['a'])
  })

  it('shelves a unit whose group the log never recorded with the other datasheets', () => {
    expect(armyShelves([unit({ key: 'a' })], true).map((shelf) => shelf.id)).toEqual(['other'])
  })

  it('draws a leader inside the unit it joined', () => {
    const units = [
      unit({ key: 'squad', group: 'battleline' }),
      unit({ key: 'lord', group: 'character', attachedTo: 'squad', joined: [{ label: 'Leading', name: 'squad' }] }),
    ]
    expect(armyShelves(units, true).map((shelf) => shelf.entries.map((members) => members.map((entry) => entry.key)))).toEqual([
      [['squad', 'lord']],
    ])
  })

  it('stands a leader alone once the unit it joined is destroyed', () => {
    const units = [
      unit({ key: 'squad', group: 'battleline', destroyed: true, alive: 0 }),
      unit({ key: 'lord', group: 'character', attachedTo: 'squad' }),
    ]
    expect(armyShelves(units, true).map((shelf) => shelf.id)).toEqual(['character'])
  })

  it('puts the Warlord first on its shelf only when it leads the side', () => {
    const units = [
      unit({ key: 'a', name: 'Apothecary', group: 'character' }),
      unit({ key: 'z', name: 'Zephyr', group: 'character', warlord: true }),
    ]
    const order = (leads: boolean) => armyShelves(units, leads)[0]!.entries.map(([host]) => host!.key)
    expect([order(true), order(false)]).toEqual([
      ['z', 'a'],
      ['a', 'z'],
    ])
  })
})
