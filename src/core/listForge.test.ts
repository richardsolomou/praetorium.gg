import { describe, expect, it } from 'vitest'
import { fromListForgeText, fromListForgeWtcText } from './listForge'

// Sanitized and shortened from ListForge's own share exports.
const detailed = `Plague test - Death Guard - Priority Assets - Death Lord's Chosen (375 Points)


Attached Units:
Lord of Contagion + Deathshroud Terminators (270 pts)
  Lord of Contagion (120 pts)
    • Manreaper
    • Warlord
    • E: Face of Death
  Deathshroud Terminators (150 pts)
    • Deathshroud Terminator Champion
      • Icon of Despair
      • Manreaper
    • 2x Deathshroud Terminator
      • 2x Manreaper


Vehicle:
Helbrute (105 pts)
  • Helbrute hammer
  • Helbrute fist with heavy flamer
    • Helbrute fist
    • Heavy flamer
`

const wtc = `+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
List Name: Plague test
Factions Used: Death Guard
Army Points: 375
Army Enhancements (list on which model): Face of Death (on Lord of Contagion)
Disposition: Priority Assets
Detachment(s): Death Lord's Chosen
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

ATTACHED UNITS:
Lord of Contagion + Deathshroud Terminators (270 pts)
  Lord of Contagion (120 pts)
    • Manreaper
    • Warlord
    • Enhancement: Face of Death
  Deathshroud Terminators (150 pts)
    • 2x Deathshroud Terminator
      • 2x Manreaper


OTHER DATASHEETS:
Helbrute (105 pts)
  • Helbrute hammer
`

describe('ListForge text import', () => {
  it('reads the detailed layout, its setup line, and attached units', () => {
    expect(fromListForgeText(detailed)).toEqual({
      name: 'Plague test',
      reportedPoints: 375,
      faction: 'Death Guard',
      detachment: "Death Lord's Chosen",
      disposition: 'Priority Assets',
      limit: null,
      units: [
        {
          name: 'Lord of Contagion',
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
          selections: [
            { name: 'Deathshroud Terminator Champion', count: 1 },
            { name: 'Icon of Despair', count: 1 },
            { name: 'Manreaper', count: 1 },
            { name: 'Deathshroud Terminator', count: 2 },
            { name: 'Manreaper', count: 2 },
          ],
          leading: null,
          warlord: false,
          entry: 1,
        },
        {
          name: 'Helbrute',
          selections: [
            { name: 'Helbrute hammer', count: 1 },
            { name: 'Helbrute fist with heavy flamer', count: 1 },
            { name: 'Helbrute fist', count: 1 },
            { name: 'Heavy flamer', count: 1 },
          ],
          leading: null,
          warlord: false,
        },
      ],
    })
  })

  it('reads the WTC layout', () => {
    const parsed = fromListForgeWtcText(wtc)
    expect(parsed).toMatchObject({
      name: 'Plague test',
      reportedPoints: 375,
      faction: 'Death Guard',
      detachment: "Death Lord's Chosen",
      disposition: 'Priority Assets',
      limit: null,
    })
    expect(parsed?.units.map((unit) => [unit.name, unit.entry, unit.attachedToEntry])).toEqual([
      ['Lord of Contagion', undefined, 1],
      ['Deathshroud Terminators', 1, undefined],
      ['Helbrute', undefined, undefined],
    ])
    expect(parsed?.units[0]?.selections).toContainEqual({ name: 'Enhancement: Face of Death', count: 1 })
  })

  it('reads a list without a detachment', () => {
    expect(fromListForgeText('Empty - Necrons - No detachment (0 Points)\n\nOther Datasheets:\nImmortals (70 pts)\n')).toMatchObject({
      faction: 'Necrons',
      detachment: null,
      disposition: null,
    })
  })

  it('does not claim other layouts', () => {
    expect(fromListForgeText(wtc)).toBeNull()
    expect(fromListForgeWtcText(detailed)).toBeNull()
    expect(fromListForgeText('CL 1K - Spearhead - Test (990 Points)\n\nNecrons\n\nCHARACTERS\n\nLokhust Lord (70 Points)')).toBeNull()
  })
})
