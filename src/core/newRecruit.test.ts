import { describe, expect, it } from 'vitest'
import { fromNewRecruitShare, fromNewRecruitText, isNewRecruitLink, newRecruitShareId, type NewRecruitShare } from './newRecruit'

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
      reportedPoints: 485,
      faction: 'Xenos - Test Faction',
      detachment: 'Test Detachment',
      disposition: 'Purge the Foe',
      limit: 600,
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

  it('reads a Praetorium compact export whose footer was removed', () => {
    const parsed = fromNewRecruitText(`+++++++++++++++++++++++++++++++++++++++++++++++
+ ROSTER NAME: Test list
+ FACTION KEYWORD: Test Faction
+ DETACHMENT: Test Detachment
+ BATTLE SIZE: 1000pts
+ TOTAL ARMY POINTS: 600pts
+++++++++++++++++++++++++++++++++++++++++++++++

1x Test Leader (60 pts): Warlord
• 1x Test weapon: with a colon
Roster entry: 1`)

    expect(parsed?.units).toEqual([
      {
        name: 'Test Leader',
        models: 1,
        entry: 1,
        leading: null,
        leader: null,
        warlord: true,
        selections: [{ name: 'Test weapon: with a colon', count: 1 }],
      },
    ])
  })
})

describe('New Recruit share links', () => {
  it('recognises a pasted list link', () => {
    expect(isNewRecruitLink(' https://www.newrecruit.eu/app/list/AbC123xyz \n')).toBe(true)
  })

  it('recognises a link pasted without its scheme', () => {
    expect(isNewRecruitLink('newrecruit.eu/app/list/AbC123xyz')).toBe(true)
  })

  it('does not take an exported text for a link', () => {
    expect(isNewRecruitLink(exportText)).toBe(false)
  })

  it('does not take another site for a link', () => {
    expect(isNewRecruitLink('https://newrecruit.eu.example.com/app/list/AbC123xyz')).toBe(false)
  })
})

/** A shared list as New Recruit's selection tree holds it, with its setup named in German as a translated list is. */
function shared(): NewRecruitShare {
  const leaf = (name: string, amount?: number) => ({ name, ...(amount === undefined ? {} : { amount }), options: [] })
  return {
    name: 'Die Jungs',
    totalCost: 140,
    army: {
      name: 'Die Jungs',
      options: [
        {
          name: 'Xenos - Orks',
          options: [
            {
              name: 'Army Roster',
              options: [
                {
                  name: 'Konfiguration',
                  option_id: '4ac9-fd30-1e3d-b249',
                  options: [
                    { name: 'Kampfgrösse', option_id: '564e-fbc6-5266-3ea4', options: [leaf('Angriffsstreitmacht (2.000 Punkte)', 1)] },
                    {
                      name: 'Kontingent',
                      option_id: '73c2-d0ed-3c7e-7e17',
                      options: [{ name: 'Kontingent', options: [leaf('War Horde', 1)] }],
                    },
                    { name: 'Force Disposition', option_id: '2f69-9148-45b4-86a8', options: [leaf('Take and Hold', 1)] },
                  ],
                },
                {
                  name: 'Character',
                  options: [
                    {
                      name: 'Warboss',
                      uid: 'boss',
                      amount: 1,
                      options: [leaf('Warlord', 1), { name: 'Wargear', options: [leaf('Big Choppa'), leaf('Slugga', 1)] }],
                    },
                  ],
                },
                {
                  name: 'Battleline',
                  options: [
                    {
                      name: 'Boyz',
                      uid: 'boyz',
                      amount: 1,
                      associated: [{ uid: 'boss' }],
                      options: [
                        { name: '1-2 Nobz', options: [{ name: 'Nob', amount: 1, options: [leaf('Big Choppa', 1)] }] },
                        { name: '9-18 Boyz', options: [{ name: 'Boy', amount: 9, options: [leaf('Choppa', 1), leaf('Slugga', 0)] }] },
                      ],
                    },
                  ],
                },
                { name: 'Reference', option_id: 'eef1-be80-500a-edfc', options: [leaf("Martial Ka'tah Reference", 1)] },
              ],
            },
          ],
        },
      ],
    },
  }
}

describe('fromNewRecruitShare', () => {
  it('reads a translated list’s setup by its BattleScribe ids', () => {
    expect(fromNewRecruitShare(shared())).toMatchObject({
      faction: 'Xenos - Orks',
      detachment: 'War Horde',
      disposition: 'Take and Hold',
      limit: 2000,
    })
  })

  it('counts each model and the choices it carries, leaving out a choice taken none of', () => {
    expect(fromNewRecruitShare(shared())!.units[1]).toMatchObject({
      name: 'Boyz',
      models: 10,
      selections: [
        { name: 'Nob', count: 1 },
        { name: 'Big Choppa', count: 1, model: 'Nob' },
        { name: 'Boy', count: 9 },
        { name: 'Choppa', count: 9, model: 'Boy' },
      ],
    })
  })

  it('names what it holds as the catalogue does, for a list New Recruit shows in another language', () => {
    const named = (id: string) => ({ boy: 'Boy' })[id]
    const share = shared()
    const boy = share.army.options[0]!.options[0]!.options[2]!.options[0]!.options[1]!.options[0]!
    Object.assign(boy, { name: 'Junge', option_id: 'boy' })
    expect(fromNewRecruitShare(share, named)!.units[1]!.selections.slice(2)).toEqual([
      { name: 'Boy', count: 9 },
      { name: 'Choppa', count: 9, model: 'Boy' },
    ])
  })

  it('reads the Warlord and the unit a character joins', () => {
    expect(fromNewRecruitShare(shared())!.units[0]).toMatchObject({
      warlord: true,
      attachedToEntry: 2,
      selections: [
        { name: 'Big Choppa', count: 1 },
        { name: 'Slugga', count: 1 },
      ],
    })
  })

  it('leaves out the rules reminders in the reference category', () => {
    expect(fromNewRecruitShare(shared())!.units.map((unit) => unit.name)).toEqual(['Warboss', 'Boyz'])
  })

  it('finds the list id in a share link', () => {
    expect(newRecruitShareId('https://www.newrecruit.eu/app/list/Z6dRw?ref=x')).toBe('Z6dRw')
  })
})
