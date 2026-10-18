import { describe, expect, it } from 'vitest'
import { fromListForgeText, fromListForgeWtcText } from './listForge'
import { listForgeAllies, listForgeDetailed, listForgeWtc, warmindListForge } from './rosterText.fixtures'

const outline = (units: NonNullable<ReturnType<typeof fromListForgeText>>['units']) =>
  units.map((unit) => [unit.name, unit.entry, unit.attachedToEntry, unit.warlord])

describe('ListForge text import', () => {
  it('reads the detailed layout, its setup line, and attached units', () => {
    const parsed = fromListForgeText(listForgeDetailed)
    expect(parsed).toMatchObject({
      name: 'Sanitised list',
      reportedPoints: 510,
      faction: 'Drukhari',
      detachment: 'Exhibition of Slaughter, Kabalite Cartel',
      disposition: 'Reconnaissance',
      limit: null,
    })
    expect(parsed?.unread).toBeUndefined()
    expect(outline(parsed!.units)).toEqual([
      ['Archon', undefined, 1, true],
      ['Kabalite Warriors', 1, undefined, false],
      ['Succubus', undefined, 2, false],
      ['Wyches', 2, undefined, false],
      ['Venom', undefined, undefined, false],
      ['Venom', undefined, undefined, false],
    ])
  })

  it('reads models, their wargear, and enhancements as selections', () => {
    const [archon, warriors] = fromListForgeText(listForgeDetailed)!.units
    expect(archon?.selections).toEqual([
      { name: 'Shadowfield', count: 1 },
      { name: 'Soul Trap', count: 1 },
      { name: 'Huskblade', count: 1 },
      { name: 'Enhancement: Informant Network', count: 1 },
    ])
    expect(warriors?.selections).toContainEqual({ name: 'Kabalite Warrior', count: 5 })
    expect(warriors?.selections).toContainEqual({ name: 'Splinter rifle', count: 5 })
  })

  it('reads the WTC layout', () => {
    const parsed = fromListForgeWtcText(listForgeWtc)
    expect(parsed).toMatchObject({
      name: 'Sanitised list',
      reportedPoints: 510,
      faction: 'Drukhari',
      detachment: 'Exhibition of Slaughter, Kabalite Cartel',
      disposition: 'Reconnaissance',
      limit: null,
    })
    expect(outline(parsed!.units)).toEqual(outline(fromListForgeText(listForgeDetailed)!.units))
    expect(parsed?.units[2]?.selections).toContainEqual({ name: 'Enhancement: Periapt of Torments', count: 1 })
  })

  it('reads allied units under their faction heading', () => {
    const parsed = fromListForgeText(listForgeAllies)
    expect(parsed?.units.map((unit) => [unit.name, unit.unread])).toEqual([
      ['Nemesis Dreadknight', undefined],
      ['Imperial Rhino', undefined],
    ])
  })

  it("reads Warmind's ListForge text, with its setup lines and one line of wargear", () => {
    const parsed = fromListForgeText(warmindListForge)
    expect(parsed).toMatchObject({
      faction: 'Drukhari',
      detachment: 'Exhibition of Slaughter, Kabalite Cartel',
      disposition: 'Reconnaissance',
      limit: 2000,
      sizeName: 'Strike Force',
    })
    expect(parsed?.unread).toBeUndefined()
    expect(parsed?.units.map((unit) => unit.selections)).toEqual([
      [
        { name: 'Enhancement: Informant Network', count: 1 },
        { name: 'Soul Trap', count: 1 },
        { name: 'Huskblade', count: 1 },
      ],
      [
        { name: 'Blaster', count: 1 },
        { name: 'Dark Lance', count: 1 },
        { name: 'Phantasm Grenade Launcher', count: 1 },
        { name: 'Shredder', count: 1 },
        { name: 'Splinter Cannon', count: 1 },
        { name: 'Splinter Rifle', count: 6 },
        { name: 'Close Combat Weapon', count: 9 },
        { name: 'Power Weapon', count: 1 },
      ],
      [
        { name: 'Splinter Cannon', count: 2 },
        { name: 'Bladevanes', count: 1 },
      ],
      [
        { name: 'Splinter Cannon', count: 2 },
        { name: 'Bladevanes', count: 1 },
      ],
    ])
    expect(parsed?.units[0]?.warlord).toBe(true)
  })

  it('reads a list without a detachment', () => {
    expect(fromListForgeText('Empty - Necrons - No detachment (0 Points)\n\nOther Datasheets:\nImmortals (70 pts)\n')).toMatchObject({
      faction: 'Necrons',
      detachment: null,
      disposition: null,
    })
  })

  it('does not claim other layouts', () => {
    expect(fromListForgeText(listForgeWtc)).toBeNull()
    expect(fromListForgeWtcText(listForgeDetailed)).toBeNull()
    expect(fromListForgeText('CL 1K - Spearhead - Test (990 Points)\n\nNecrons\n\nCHARACTERS\n\nLokhust Lord (70 Points)')).toBeNull()
  })
})
