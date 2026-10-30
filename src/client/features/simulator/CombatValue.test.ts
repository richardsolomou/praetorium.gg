import { expect, it } from 'vitest'
import { formatCombatValue } from './CombatValue'

const result = { meanDamage: 2.345, meanKills: 1.234, wipe: 0.1234 }

it('formats expected wounds with two decimal places', () => {
  expect(formatCombatValue(result, 'meanDamage')).toBe('2.35')
})
it('formats destruction probability as a percentage', () => {
  expect(formatCombatValue(result, 'wipe')).toBe('12.3%')
})
it('keeps a calculated zero distinct from a missing estimate', () => {
  expect(formatCombatValue({ ...result, meanDamage: 0 }, 'meanDamage')).toBe('0.00')
})
it('shows a dash for a missing estimate', () => {
  expect(formatCombatValue(undefined, 'meanDamage')).toBe('—')
})
