import { describe, expect, it } from 'vitest'
import rawUnits from '../../catalogue/legacy-ids/units.json' with { type: 'json' }
import { legacyIdsSchema } from '../core/legacyIds'
import { vsShellOf, vsShellSpreads, vsSwornDatasheets } from './vsDataShell'

const gains = { options: { 'host.squad.weapon': { 'host.chainfist': 1 } } }
const shell = vsShellOf({
  squad: { unit: 'host.squad', unmatched: [], choices: { 'unit/heavy/fist|chainfist': gains, 'unit|fist-model': gains } },
})

describe('vsShellOf', () => {
  it('arms a choice on the model’s group before a weapon nested deeper', () => {
    expect(shell.squad?.['host.squad.weapon']?.['host.chainfist']?.[0]).toEqual(['unit', 'fist-model'])
  })
})

describe('vsShellSpreads', () => {
  it('leaves a pick that takes nothing to its own catalogue choices', () => {
    expect(vsShellSpreads(shell.squad, {})).toBeNull()
  })
})

describe('vsSwornDatasheets', () => {
  const units = { prince: 'host.prince', nurgle: 'host.grinder', khorne: 'host.grinder' }
  const allegiances = { prince: 'host.khorne', nurgle: 'host.nurgle', khorne: 'host.khorne' }

  it('keeps an entry alone from standing for the god a pick without one reads as', () => {
    expect(vsSwornDatasheets(units, allegiances)).not.toHaveProperty('prince')
  })

  it('starts neither Daemon Prince of Chaos sworn to the god its catalogue entry reads as', () => {
    const { ids, allegiances: frozen = {} } = legacyIdsSchema.parse(rawUnits)
    expect(Object.keys(vsSwornDatasheets(ids, frozen)).filter((entryId) => ids[entryId]?.includes('daemon-prince'))).toEqual([])
  })

  it('reads each of a unit’s datasheets split by god as standing for its own', () => {
    expect(vsSwornDatasheets(units, allegiances)).toEqual({ nurgle: 'host.nurgle', khorne: 'host.khorne' })
  })
})
