import { describe, expect, it } from 'vitest'
import type { UnitState } from '../core/battle'
import { armyModels, armyShelves } from './armyUnits'

const unit = (overrides: Partial<UnitState> & Pick<UnitState, 'key'>): UnitState => ({
  name: overrides.key,
  points: 100,
  models: 5,
  destroyed: false,
  deployed: true,
  formation: 'battlefield',
  alive: overrides.models ?? 5,
  ...overrides,
})

describe('armyModels', () => {
  it('counts the models still standing against the ones the army brought', () => {
    const units = [unit({ key: 'a', models: 5, alive: 2 }), unit({ key: 'b', models: 10, alive: 10 })]
    expect(armyModels(units)).toEqual({ standing: 12, total: 15 })
  })
})

describe('armyShelves', () => {
  it('reads the army on the shelves a roster is read by, in that order', () => {
    const units = [unit({ key: 'a', group: 'vehicle' }), unit({ key: 'b', group: 'character' })]
    expect(armyShelves(units).map((shelf) => shelf.id)).toEqual(['character', 'vehicle'])
  })

  it('omits a shelf nothing is left on', () => {
    expect(armyShelves([unit({ key: 'a', group: 'vehicle' })]).map((shelf) => shelf.plural)).toEqual(['Vehicles'])
  })

  it('takes a destroyed unit off its shelf', () => {
    const units = [unit({ key: 'a', group: 'vehicle' }), unit({ key: 'b', group: 'vehicle', destroyed: true, alive: 0 })]
    expect(armyShelves(units).flatMap((shelf) => shelf.units.map((entry) => entry.key))).toEqual(['a'])
  })

  it('shelves a unit whose group the log never recorded with the other datasheets', () => {
    expect(armyShelves([unit({ key: 'a' })]).map((shelf) => shelf.id)).toEqual(['other'])
  })
})
