import { describe, expect, it } from 'vitest'
import type { VsPick } from './roster'
import { definitions } from './vsUnit.fixtures'
import { vsPickIn } from './vsPickUpgrade'

const squad: VsPick = {
  models: { 'host.squad.sergeant': 1, 'host.squad.trooper': 4 },
  options: { 'host.squad.sergeant-rifle': { 'host.sword': 1 } },
}

describe('vsPickIn', () => {
  it('keeps a pick every reference of which the rules version holds as current', () => {
    expect(vsPickIn(definitions, 'host.squad', squad)).toBe(squad)
  })

  it('lets a pick go that names wargear the rules version no longer holds', () => {
    expect(vsPickIn(definitions, 'host.squad', { ...squad, options: { 'host.squad.sergeant-rifle': { 'host.axe': 1 } } })).toBeUndefined()
  })

  it('lets a pick go that names another datasheet’s models', () => {
    expect(vsPickIn(definitions, 'host.captain', squad)).toBeUndefined()
  })
})
