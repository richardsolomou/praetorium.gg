import { describe, expect, it } from 'vitest'
import { fromNewRecruitText } from './newRecruit'

const exportText = `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Test Faction
+ DETACHMENT: Test Detachment (Test Rule)
+ FORCE DISPOSITION: Purge the Foe
+ TOTAL ARMY POINTS: 485pts
+
+ WARLORD: Char1: Test Leader
++++++++++++++++++++++++++++++++++++++++++++++

Char1: 1x Test Leader (50 pts): Warlord, Hover Device, Marker Device
Leading Test Squad

10x Test Squad (70 pts)
• 1x Test Sergeant: Guardian Device, Marker Device
• 9x Test Trooper
  Attached to Test Leader

3x Test Suits (100 pts)
• 1x Test Suit Leader: Marker Device, Shield Device, 2x Plasma weapon
• 2x Test Suit: 2 with Gun Device, Shield Device, 2x Plasma weapon

5x Test Scouts (100 pts)
• 4x Test Scout
    1 with Homing beacon
• 1x Test Scout Leader: Gun Device, Marker Device, Sidearm, Special weapon

Created with newrecruit.eu v35.51`

describe('NewRecruit text import', () => {
  it('reads list setup and units', () => {
    expect(fromNewRecruitText(exportText)).toEqual({
      name: 'Test Faction 485pts',
      faction: 'Xenos - Test Faction',
      detachment: 'Test Detachment',
      disposition: 'Purge the Foe',
      limit: 500,
      units: [
        {
          name: 'Test Leader',
          models: 1,
          leading: 'Test Squad',
          leader: null,
          warlord: true,
          selections: [
            { name: 'Hover Device', count: 1 },
            { name: 'Marker Device', count: 1 },
          ],
        },
        {
          name: 'Test Squad',
          models: 10,
          leading: null,
          leader: 'Test Leader',
          warlord: false,
          selections: [
            { name: 'Test Sergeant', count: 1 },
            { name: 'Guardian Device', count: 1 },
            { name: 'Marker Device', count: 1 },
            { name: 'Test Trooper', count: 9 },
          ],
        },
        {
          name: 'Test Suits',
          models: 3,
          leading: null,
          leader: null,
          warlord: false,
          selections: [
            { name: 'Test Suit Leader', count: 1 },
            { name: 'Marker Device', count: 1 },
            { name: 'Shield Device', count: 3 },
            { name: 'Plasma weapon', count: 6 },
            { name: 'Test Suit', count: 2 },
            { name: 'Gun Device', count: 2 },
          ],
        },
        {
          name: 'Test Scouts',
          models: 5,
          leading: null,
          leader: null,
          warlord: false,
          selections: [
            { name: 'Test Scout', count: 4 },
            { name: 'Homing beacon', count: 1 },
            { name: 'Test Scout Leader', count: 1 },
            { name: 'Gun Device', count: 1 },
            { name: 'Marker Device', count: 1 },
            { name: 'Sidearm', count: 1 },
            { name: 'Special weapon', count: 1 },
          ],
        },
      ],
    })
  })

  it('does not claim unrelated text', () => {
    expect(fromNewRecruitText('+ FACTION KEYWORD: Test Faction\n1x Test Unit (50 pts)')).toBeNull()
  })

  it('reads alternate bullets, standalone enhancements, non-breaking spaces, and numbered attachments', () => {
    const parsed = fromNewRecruitText(`+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Imperium - Test Faction
+ DETACHMENT: First\u00a0Detachment, Second\u00a0Detachment (Test Rule)
+ FORCE DISPOSITION: Take\u00a0and\u00a0Hold
+ TOTAL ARMY POINTS: 1,995pts
++++++++++++++++++++++++++++++++++++++++++++++

Char1: 1x Test Leader (160 pts): Test weapon
Enhancement: Test Relic (+30 pts)
Leading Test Unit[1]

5x Test Unit (215 pts)
* 3x Test Model (First loadout): 3 with First weapon
* 2x Test Model (Second loadout): 2 with Second weapon

Created with newrecruit.eu v35.46`)

    expect(parsed).toMatchObject({
      name: 'Test Faction 1995pts',
      detachment: 'First Detachment, Second Detachment',
      disposition: 'Take and Hold',
      limit: 2000,
      units: [
        {
          name: 'Test Leader',
          leading: 'Test Unit',
          selections: [
            { name: 'Test weapon', count: 1 },
            { name: 'Enhancement: Test Relic', count: 1 },
          ],
        },
        {
          name: 'Test Unit',
          models: 5,
          selections: [
            { name: 'Test Model (First loadout)', count: 3 },
            { name: 'First weapon', count: 3 },
            { name: 'Test Model (Second loadout)', count: 2 },
            { name: 'Second weapon', count: 2 },
          ],
        },
      ],
    })
  })
})
