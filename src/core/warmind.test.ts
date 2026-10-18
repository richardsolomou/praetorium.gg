import { describe, expect, it } from 'vitest'
import { fromWarmindText } from './warmind'

// A Warmind web builder export, copied with its default format.
const exportText = `Plague Test
──────────────────────────────
Faction: Death Guard
Detachment: Death Lord's Chosen
Battle Size: Incursion (1000 pts)
Total: 375 / 1000 pts · 2/2 DP · ✓ Legal
Disposition: Priority Assets

INFANTRY
Lord of Contagion (120 pts) · Warlord
   · Manreaper
   · Enhancement: Face of Death (+10 pts)
   └ Leads: Deathshroud Terminators ×3 (150 pts)
      · Icon of Despair, 3× Plaguespurt Gauntlet, 3× Manreaper

VEHICLE
Helbrute (105 pts)
   · Close Combat Weapon, Helbrute Fist with Heavy Flamer, Helbrute Hammer

──────────────────────────────
375 / 1000 pts · 3 units · Incursion
Built with Warmind · https://warmind.online`

describe('Warmind text import', () => {
  it('reads list setup, model counts, loadouts, and attached units', () => {
    expect(fromWarmindText(exportText)).toEqual({
      name: 'Plague Test',
      reportedPoints: 375,
      faction: 'Death Guard',
      detachment: "Death Lord's Chosen",
      disposition: 'Priority Assets',
      limit: 1000,
      sizeName: 'Incursion',
      units: [
        {
          name: 'Lord of Contagion',
          models: 1,
          selections: [
            { name: 'Manreaper', count: 1 },
            { name: 'Enhancement: Face of Death', count: 1 },
          ],
          leading: null,
          warlord: true,
          attachedToEntry: 1,
        },
        {
          name: 'Deathshroud Terminators',
          models: 3,
          selections: [
            { name: 'Icon of Despair', count: 1 },
            { name: 'Plaguespurt Gauntlet', count: 3 },
            { name: 'Manreaper', count: 3 },
          ],
          leading: null,
          warlord: false,
          entry: 1,
        },
        {
          name: 'Helbrute',
          models: 1,
          selections: [
            { name: 'Close Combat Weapon', count: 1 },
            { name: 'Helbrute Fist with Heavy Flamer', count: 1 },
            { name: 'Helbrute Hammer', count: 1 },
          ],
          leading: null,
          warlord: false,
        },
      ],
    })
  })

  it('needs the Warmind footer', () => {
    expect(fromWarmindText(exportText.replace(/Built with Warmind.*$/, ''))).toBeNull()
  })
})
