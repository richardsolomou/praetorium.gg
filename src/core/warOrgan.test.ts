import { describe, expect, it } from 'vitest'
import { fromWarOrganText } from './warOrgan'

// Shortened from a published event list.
const exported = `Bonk list, more dakka [1985 points]
Adeptus Mechanicus
Battle Size: Strike Force (2000 point limit)

Detachments: Eradication Cohort, Cohort Cybernetica (3/3 Detachment Points)
Force Disposition: Purge The Foe

Datasmith Crew

  Cybernetica Datasmith (35 points)
    • Warlord
    • Archeotech pistol and Power fist
    • Martial Signatum Amplificator [+15 points]

  Kastelan Robots [The Bonkers] (300 points)
    • 2 Kastelan Robots with Heavy phosphor blaster and Twin kastelan fist

Vehicle

  Skorpius Disintegrator (170 points)
    • 3 Cognis heavy stubbers, Armoured hull and Ferrumite cannon

  Skitarii Rangers (85 points)
    • 1 Skitarii Rangers with Close combat weapon and Galvanic rifle and omnispex

Created with WarOrgan ()`

describe('WarOrgan text import', () => {
  const parsed = fromWarOrganText(exported)

  it('reads the list setup', () => {
    expect(parsed).toMatchObject({
      name: 'Bonk list, more dakka',
      reportedPoints: 1985,
      faction: 'Adeptus Mechanicus',
      detachment: 'Eradication Cohort, Cohort Cybernetica',
      disposition: 'Purge The Foe',
      limit: 2000,
      sizeName: 'Strike Force',
    })
  })

  it('reads each unit, its Warlord, nickname and the group its heading puts it in', () => {
    expect(parsed?.units.map(({ name, warlord, nickname, group }) => ({ name, warlord, nickname, group }))).toEqual([
      { name: 'Cybernetica Datasmith', warlord: true, nickname: undefined, group: 1 },
      { name: 'Kastelan Robots', warlord: false, nickname: 'The Bonkers', group: 1 },
      { name: 'Skorpius Disintegrator', warlord: false, nickname: undefined, group: 2 },
      { name: 'Skitarii Rangers', warlord: false, nickname: undefined, group: 2 },
    ])
  })

  it('reads each piece a line joins, with its enhancement, counts and models', () => {
    expect(parsed?.units.map((unit) => unit.selections)).toEqual([
      [
        { name: 'Archeotech pistol', count: 1 },
        { name: 'Power fist', count: 1 },
        { name: 'Enhancements: Martial Signatum Amplificator', count: 1 },
      ],
      [
        { name: 'Kastelan Robots', count: 2 },
        { name: 'Heavy phosphor blaster', count: 2, model: 'Kastelan Robots' },
        { name: 'Twin kastelan fist', count: 2, model: 'Kastelan Robots' },
      ],
      [
        { name: 'Cognis heavy stubbers', count: 3 },
        { name: 'Armoured hull', count: 1 },
        { name: 'Ferrumite cannon', count: 1 },
      ],
      [
        { name: 'Skitarii Rangers', count: 1 },
        { name: 'Close combat weapon', count: 1, model: 'Skitarii Rangers' },
        { name: 'Galvanic rifle and omnispex', count: 1, model: 'Skitarii Rangers' },
      ],
    ])
  })

  it('does not claim the official app’s text', () => {
    expect(
      fromWarOrganText('Blades (70 Points)\n\nNecrons\nStrike Force (2,000 Points)\n\nTomb Blades (70 Points)\n  • 3x Tomb Blade'),
    ).toBeNull()
  })
})
