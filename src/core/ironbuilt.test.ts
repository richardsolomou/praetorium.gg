import { describe, expect, it } from 'vitest'
import { fromIronbuiltText } from './ironbuilt'

const exported = `+==========================================
Sanitised list — T'au Empire
Kauyon (2DP) + Experimental Prototype Cadre (1DP)
Force Disposition: Reconnaissance
265 / 2000 pts · 3 units
+==========================================

── ATTACHED CHARACTERS ─────────
----Attached Unit A [195 pts]---------------------
Commander Farsight [70 pts]
Weapons: High-intensity plasma rifle, ➤ Dawn Blade - strike, ➤ Dawn Blade - sweep
↳ Attached to:

Crisis Sunforge Battlesuits [125 pts]
2x Crisis Sunforge Shas’ui
1x Crisis Sunforge Shas’vre
Weapons: Fusion blaster x6, Twin pulse carbine x2, Battlesuit fists x3
Wargear: Shield Drone, Marker Drone

── UNATTACHED CHARACTERS ───────
Commander Shadowsun [WARLORD] [100 pts]
Weapons: Light missile pod, High-energy fusion blaster x2

Total: 265 pts
https://ironbuilt.app/?s=example`

describe('Ironbuilt text import', () => {
  it('reads the setup inside its frame', () => {
    expect(fromIronbuiltText(exported)).toMatchObject({
      name: 'Sanitised list',
      faction: "T'au Empire",
      detachment: 'Kauyon, Experimental Prototype Cadre',
      disposition: 'Reconnaissance',
      reportedPoints: 265,
      limit: 2000,
    })
  })

  it('attaches a group and leaves a unit after it on its own', () => {
    expect(fromIronbuiltText(exported)?.units.map((unit) => [unit.name, unit.entry, unit.attachedToEntry, unit.warlord])).toEqual([
      ['Commander Farsight', undefined, 1, false],
      ['Crisis Sunforge Battlesuits', 1, undefined, false],
      ['Commander Shadowsun', undefined, undefined, true],
    ])
  })

  it("reads models and counted wargear, and a weapon's profiles as one weapon", () => {
    const [farsight, suits] = fromIronbuiltText(exported)!.units
    expect([farsight?.selections, suits?.selections]).toEqual([
      [
        { name: 'High-intensity plasma rifle', count: 1 },
        { name: 'Dawn Blade', count: 1 },
      ],
      [
        { name: 'Crisis Sunforge Shas’ui', count: 2 },
        { name: 'Crisis Sunforge Shas’vre', count: 1 },
        { name: 'Fusion blaster', count: 6 },
        { name: 'Twin pulse carbine', count: 2 },
        { name: 'Battlesuit fists', count: 3 },
        { name: 'Shield Drone', count: 1 },
        { name: 'Marker Drone', count: 1 },
      ],
    ])
  })

  it('does not claim other framed layouts', () => {
    expect(fromIronbuiltText('+++++++++++++++\nList Name: Lord\nFactions Used: Necrons\n+++++++++++++++')).toBeNull()
  })
})
