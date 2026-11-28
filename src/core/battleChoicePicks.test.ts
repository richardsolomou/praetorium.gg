import { expect, it } from 'vitest'
import { unitPicksOf, withUnitPicks } from './battleChoicePicks'

it('applies a pick made on a Leader to the Bodyguard it is attached to', () => {
  const placed = [{}, { attachedTo: 0 }]
  const units = withUnitPicks({}, placed, 1, 'Noospheric Transference', ['Halo Override'])
  expect(unitPicksOf(units, placed, 0, 'Noospheric Transference')).toEqual(['Halo Override'])
})
