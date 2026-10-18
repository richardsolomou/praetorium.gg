import { describe, expect, it } from 'vitest'
import { fromWarmindText } from './warmind'
import { warmind } from './rosterText.fixtures'

describe('Warmind text import', () => {
  it('reads list setup, both detachments, and the battle size', () => {
    expect(fromWarmindText(warmind)).toMatchObject({
      name: 'Sanitised list',
      reportedPoints: 510,
      faction: 'Drukhari',
      detachment: 'Exhibition of Slaughter, Kabalite Cartel',
      disposition: 'Reconnaissance',
      limit: 2000,
      sizeName: 'Strike Force',
    })
  })

  it('reads model counts, loadouts, and attached units', () => {
    const parsed = fromWarmindText(warmind)
    expect(parsed?.unread).toBeUndefined()
    expect(parsed?.units.map((unit) => [unit.name, unit.models, unit.entry, unit.attachedToEntry, unit.warlord])).toEqual([
      ['Archon', 1, undefined, 1, true],
      ['Kabalite Warriors', 10, 1, undefined, false],
      ['Succubus', 1, undefined, 2, false],
      ['Wyches', 10, 2, undefined, false],
      ['Venom', 1, undefined, undefined, false],
      ['Venom', 1, undefined, undefined, false],
    ])
    expect(parsed?.units[0]?.selections).toEqual([
      { name: 'Soul Trap', count: 1 },
      { name: 'Huskblade', count: 1 },
      { name: 'Enhancement: Informant Network', count: 1 },
    ])
    expect(parsed?.units[3]?.selections).toEqual([
      { name: 'Splinter Pistol', count: 7 },
      { name: 'Gladiatorial Weapons', count: 3 },
      { name: 'Hekatarii Blade', count: 7 },
    ])
  })

  it('needs the Warmind footer', () => {
    expect(fromWarmindText(warmind.replace(/Built with Warmind.*$/, ''))).toBeNull()
  })
})
