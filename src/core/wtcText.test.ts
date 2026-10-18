import { describe, expect, it } from 'vitest'
import { fromWtcText } from './wtcText'

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

// A Warmind "New Recruit (WTC)" export, which has no footer.
const compactLayout = `+ FACTION KEYWORD: Death Guard
+ DETACHMENT: Death Lord's Chosen
+ TOTAL ARMY POINTS: 375pts
+ BATTLE SIZE: Incursion (1000 point limit)
+ FORCE DISPOSITION: Priority Assets
+ WARLORD: Char1: Lord of Contagion
+ NUMBER OF UNITS: 2

CHARACTER

Char1: 1x Lord of Contagion (120 pts): Warlord, Manreaper
Enhancement: Face of Death (+10 pts)

OTHER DATASHEETS

3x Deathshroud Terminators (150 pts)
3 with Plaguespurt Gauntlet, Manreaper
1 with Icon of Despair`

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

  it('reads the tournament layout and a named battle size', () => {
    const parsed = fromWtcText(compactLayout)
    expect(parsed).toMatchObject({ limit: 1000, sizeName: 'Incursion', reportedPoints: 375, disposition: 'Priority Assets' })
    expect(parsed?.units.map((unit) => [unit.name, unit.models, unit.warlord, unit.unread])).toEqual([
      ['Lord of Contagion', 1, true, undefined],
      ['Deathshroud Terminators', 3, false, undefined],
    ])
    expect(parsed?.units[0]?.selections).toContainEqual({ name: 'Enhancement: Face of Death', count: 1 })
  })

  it('needs a faction keyword', () => {
    expect(fromWtcText('CHARACTER\n\nLokhust Lord (70 pts)')).toBeNull()
  })
})
