import { describe, expect, it } from 'vitest'
import { fromBattleBaseText } from './battlebase'
import { toGwText, type GwTextRoster } from './gwText'
import { fromNewRecruitText } from './newRecruit'

const roster: GwTextRoster = {
  name: 'Repeated squads',
  faction: 'Test Faction',
  detachments: [
    { name: 'First', points: 1 },
    { name: 'Second', points: 1 },
  ],
  dispositions: ['Take and Hold'],
  size: 'Strike Force',
  limit: 2000,
  points: 190,
  units: [
    {
      name: 'Test Squad',
      points: 90,
      group: 'other',
      models: 5,
      entry: 2,
      warlord: false,
      joined: [],
      enhancements: [],
      upgrades: [],
      wargear: [
        { name: 'First weapon', count: 3 },
        { name: 'Second weapon', count: 2 },
      ],
    },
    {
      name: 'Test Leader',
      points: 100,
      group: 'character',
      models: 1,
      entry: 1,
      attachedToEntry: 2,
      warlord: true,
      joined: [{ label: 'Leading', name: 'Test Squad' }],
      enhancements: ['Test Relic'],
      upgrades: [],
      wargear: [{ name: 'Third weapon', count: 2 }],
    },
  ],
}

const compactText = `+++++++++++++++++++++++++++++++++++++++++++++++
+ ROSTER NAME: Repeated squads
+ FACTION KEYWORD: Test Faction
+ DETACHMENT: First and Second
+ FORCE DISPOSITION: Take and Hold
+ BATTLE SIZE: 2000pts
+ TOTAL ARMY POINTS: 190pts
+++++++++++++++++++++++++++++++++++++++++++++++

5x Test Squad (90 pts)
• 3x First weapon
• 2x Second weapon
Roster entry: 2

1x Test Leader (100 pts): Warlord
• 2x Third weapon
Enhancement: Test Relic
Leading Test Squad
Roster entry: 1
Attached to entry: 2

Exported with Praetorium.gg vtest
`

describe('roster text interchange', () => {
  it('reads explicit model counts instead of inferring them from weapon counts', () => {
    expect(fromBattleBaseText(toGwText(roster, 'test'))?.units.map((unit) => unit.models)).toEqual([1, 5])
  })

  it('retains entry identity when sections reorder attached units', () => {
    expect(fromBattleBaseText(toGwText(roster, 'test'))?.units.map((unit) => [unit.entry, unit.attachedToEntry])).toEqual([
      [1, 2],
      [2, undefined],
    ])
  })

  it('retains compact setup without guessing the battle size from spent points', () => {
    expect(fromNewRecruitText(compactText)).toMatchObject({
      name: 'Repeated squads',
      detachment: 'First and Second',
      disposition: 'Take and Hold',
      limit: 2000,
      reportedPoints: 190,
    })
  })

  it('retains a compact mixed loadout and its equipment quantities', () => {
    expect(fromNewRecruitText(compactText)?.units[0]).toMatchObject({
      models: 5,
      entry: 2,
      selections: [
        { name: 'First weapon', count: 3 },
        { name: 'Second weapon', count: 2 },
      ],
    })
  })

  it('reports an unread selection line instead of claiming a complete import', () => {
    const text = toGwText(roster, 'test').replace('    • 3x First weapon', '    mysterious selected equipment')
    expect(fromBattleBaseText(text)?.units[1]?.unread).toEqual(['mysterious selected equipment'])
  })

  it('recognizes structurally complete unattributed army text without a tool footer', () => {
    const text =
      'Sample (90 Points)\n\nTest Faction\nFirst\nStrike Force (2,000 Points)\n\nOTHER DATASHEETS\n\nTest Squad (90 Points)\n    • 5x First weapon\n'
    expect(fromBattleBaseText(text)?.detachment).toBe('First')
  })

  it('writes a custom points budget beside the battle size in readable text', () => {
    expect(toGwText({ ...roster, pointsBudget: 1500 }, 'test')).toContain('Strike Force (1,500 Points)')
  })

  it('reads the battle size and its custom points budget back from readable text', () => {
    const parsed = fromBattleBaseText(toGwText({ ...roster, pointsBudget: 1500 }, 'test'))
    expect([parsed?.sizeName, parsed?.limit]).toEqual(['Strike Force', 1500])
  })

  it('reads the battle size and its custom points budget back from compact text', () => {
    const parsed = fromNewRecruitText(compactText.replace('+ BATTLE SIZE: 2000pts', '+ BATTLE SIZE: 1500pts (Strike Force)'))
    expect([parsed?.sizeName, parsed?.limit]).toEqual(['Strike Force', 1500])
  })

  it('refuses arbitrary text that merely contains a points value', () => {
    expect(fromBattleBaseText('Sample (90 Points)\nTest Faction\nTest Squad (90 Points)')).toBeNull()
  })
})
