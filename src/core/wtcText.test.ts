import { describe, expect, it } from 'vitest'
import { fromWtcText } from './wtcText'
import { warmindWtc } from './rosterText.fixtures'

// Shortened from a published event list, with the player and team removed.
const officialLayout = `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - T'au Empire
+ DETACHMENT: Retaliation Cadre (Bonded Heroes)
+ FORCE DISPOSITION: Purge the Foe
+ TOTAL ARMY POINTS: 2000pts
+
+ WARLORD: Char1: Commander Farsight
+ ENHANCEMENT: Starflare Ignition System (on Char2: Commander in Enforcer Battlesuit)
+ NUMBER OF UNITS: 3
+++++++++++++++++++++++++++++++++++++++++++++++

Attached Units

Attached Unit 1

Commander Farsight (70 pts)
• Attached as: Leader (Character)
• 1x Dawn Blade
• Warlord

Crisis Fireknife Battlesuits (130 pts)
• Attached as: Bodyguard
• 1x Crisis Fireknife Shas’vre
• Marker Drone, Shield Drone

CHARACTER

Commander in Enforcer Battlesuit (100 pts)
• 4x Missile pod
• Starflare Ignition System (+20 pts)

Created with newrecruit.eu v35.79`

describe('WTC text import', () => {
  it('reads the official app layout under a WTC header', () => {
    expect(fromWtcText(officialLayout)).toEqual({
      name: "T'au Empire 2000pts",
      reportedPoints: 2000,
      faction: "Xenos - T'au Empire",
      detachment: 'Retaliation Cadre',
      disposition: 'Purge the Foe',
      limit: null,
      units: [
        {
          name: 'Commander Farsight',
          selections: [{ name: 'Dawn Blade', count: 1 }],
          leading: null,
          warlord: true,
          attachedToEntry: 1,
        },
        {
          name: 'Crisis Fireknife Battlesuits',
          selections: [
            { name: 'Crisis Fireknife Shas’vre', count: 1 },
            { name: 'Marker Drone', count: 1 },
            { name: 'Shield Drone', count: 1 },
          ],
          leading: null,
          warlord: false,
          entry: 1,
        },
        {
          name: 'Commander in Enforcer Battlesuit',
          selections: [
            { name: 'Missile pod', count: 4 },
            { name: 'Starflare Ignition System', count: 1 },
          ],
          leading: null,
          warlord: false,
        },
      ],
    })
  })

  it("reads Warmind's tournament layout, both detachments, and a named battle size", () => {
    const parsed = fromWtcText(warmindWtc)
    expect(parsed).toMatchObject({
      detachment: 'Exhibition of Slaughter, Kabalite Cartel',
      limit: 2000,
      sizeName: 'Strike Force',
      reportedPoints: 350,
      disposition: 'Reconnaissance',
    })
    expect(parsed?.units.map((unit) => [unit.name, unit.models, unit.warlord, unit.unread])).toEqual([
      ['Archon', 1, true, undefined],
      ['Kabalite Warriors', 10, false, undefined],
      ['Venom', 1, false, undefined],
      ['Venom', 1, false, undefined],
    ])
    expect(parsed?.units[0]?.selections).toContainEqual({ name: 'Enhancement: Informant Network', count: 1 })
  })

  it('needs a faction keyword', () => {
    expect(fromWtcText('CHARACTER\n\nLokhust Lord (70 pts)')).toBeNull()
  })
})
