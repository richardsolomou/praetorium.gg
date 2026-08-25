import { describe, expect, it } from 'vitest'
import { toGwText } from './gwText'

describe('GW text export', () => {
  it('writes roster setup and units in catalogue sections', () => {
    expect(
      toGwText(
        {
          name: "Four C'tan Pantheon",
          faction: 'Necrons',
          detachments: [{ name: 'Pantheon of Woe', points: 2 }],
          dispositions: ['Disruption', 'Reconnaissance'],
          size: 'Strike Force',
          limit: 2000,
          points: 2000,
          units: [
            {
              name: 'C’tan Shard',
              points: 375,
              group: 'character',
              warlord: true,
              joined: [{ label: 'Leading', name: 'Lychguard' }],
              wargear: [{ name: 'Golden fists', count: 1 }],
              enhancements: ['Singularity Matrix'],
              upgrades: ['Unmaker'],
            },
          ],
        },
        '0.28.0',
      ),
    ).toBe(
      "Four C'tan Pantheon (2,000 Points)\n\nNecrons\nPantheon of Woe (2 Detachment Points)\nForce Dispositions: Disruption, Reconnaissance\nStrike Force (2,000 Points)\n\nCHARACTERS\n\nC’tan Shard (375 Points)\n    • Leading: Lychguard\n    • Warlord\n    • 1x Golden fists\n    • Enhancement: Singularity Matrix\n    • Enhancement: Unmaker\n\nExported with Praetorium.gg v0.28.0\n",
    )
  })
})
