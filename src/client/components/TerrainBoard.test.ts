import { describe, expect, it } from 'vitest'
import { deploymentZoneClass } from './TerrainBoard'

describe('deployment zone theme colors', () => {
  it('uses red for the attacker and green for the defender', () => {
    expect(deploymentZoneClass('attacker')).toBe('fill-side-a/20 stroke-side-a')
    expect(deploymentZoneClass('defender')).toBe('fill-side-b/20 stroke-side-b')
  })

  it('uses the primary green for a neutral zone', () => {
    expect(deploymentZoneClass('either')).toBe('fill-parchment/20 stroke-parchment')
  })
})
