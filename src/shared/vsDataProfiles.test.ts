import { expect, it } from 'vitest'
import { vsDataDefinitions } from '../core/vsDataConstruction'
import { bookOf } from '../server/catalogue.fixtures'
import { datasheetIn } from './catalogue'
import { type PrintedProfile, vsProfilesIndex, vsStatLinesOf } from './vsDataProfiles'

const unit = 'test.squad'
const record = (name: string, data: Record<string, unknown>) => ({ name, data })
const STATS = { movement: 6, toughness: 4, save: 3, wounds: 2, leadership: 6, objectiveControl: 2 }
const RIFLE = { range: 24, attacks: 2, skill: 3, strength: 4, armourPenetration: 0, damage: 1 }

function indexOf(definitions: Record<string, Record<string, { name: string; data: Record<string, unknown> }>>) {
  return vsProfilesIndex(
    vsDataDefinitions({
      release: 'test',
      rulesVersion: { edition: '11th', update: 'MFM 1.6' },
      unavailable: [],
      points: [],
      definitions: {
        unit: { [unit]: record('Squad', { faction: 'test', keywords: [], sizes: [5] }) },
        model: {
          [`${unit}.trooper`]: record('Trooper', { unit, min: 4, max: 4, wargear: {} }),
          [`${unit}.sergeant`]: record('Sergeant', { unit, min: 1, max: 1, wargear: {} }),
        },
        ...definitions,
        wargear: { [`${unit}.rifle`]: record('Rifle', {}), ...definitions.wargear },
      },
    }),
    { entry: unit },
    null,
    ['Rapid Fire', 'Assault'],
    () => 'Squad',
  )
}

const printed = (name: string, type: string, values: PrintedProfile['values'] = {}): PrintedProfile => ({ name, type, values })

it('reads each mode of a weapon by its wargear and mode, as a datasheet prints them', () => {
  const index = indexOf({
    'weapon-profile': {
      [`${unit}.standard`]: record('Standard', { unit, wargear: `${unit}.rifle`, ...RIFLE }),
      [`${unit}.overcharge`]: record('Overcharge', { unit, wargear: `${unit}.rifle`, ...RIFLE, strength: 7 }),
    },
  })
  expect(vsStatLinesOf(index, 'entry', 'Squad', [printed('➤ Rifle - overcharge', 'Ranged Weapons')])[0]?.strength).toBe('7')
})

it('keeps the catalogue’s lines where it prints two models apart that one VS Data line describes', () => {
  const index = indexOf({ 'unit-profile': { [unit]: record('Squad', { unit, ...STATS }) } })
  const lines = vsStatLinesOf(index, 'entry', 'Squad', [
    printed('Trooper', 'Unit', { wounds: '2' }),
    printed('Trooper w/ storm shield', 'Unit', { wounds: '3' }),
  ])
  expect(lines).toEqual([null, null])
})

it('leaves a profile naming none of the unit’s models to the catalogue', () => {
  const index = indexOf({ 'unit-profile': { [unit]: record('Squad', { unit, ...STATS }) } })
  expect(vsStatLinesOf(index, 'entry', 'Squad', [printed('Pilot', 'Unit')])).toEqual([null])
})

it('spells a weapon keyword as the rules version’s glossary names its ability', () => {
  const index = indexOf({
    'weapon-profile': { [`${unit}.rifle`]: record('Rifle', { unit, wargear: `${unit}.rifle`, ...RIFLE, keywords: ['RAPID FIRE 1'] }) },
  })
  expect(vsStatLinesOf(index, 'entry', 'Squad', [printed('Rifle', 'Ranged Weapons')])[0]?.keywords).toBe('Rapid Fire 1')
})

it('reads no skill from a 7, which no hit roll makes', () => {
  const index = indexOf({
    'weapon-profile': { [`${unit}.rifle`]: record('Rifle', { unit, wargear: `${unit}.rifle`, ...RIFLE, skill: 7 }) },
  })
  expect(vsStatLinesOf(index, 'entry', 'Squad', [printed('Rifle', 'Ranged Weapons')])[0]?.['ballistic-skill']).toBeUndefined()
})

it('prints VS Data’s values on the datasheet in place of the catalogue’s', () => {
  const book = bookOf({
    selectionEntries: [
      {
        id: 'entry',
        name: 'Squad',
        type: 'unit',
        profiles: [
          {
            id: 'rifle-profile',
            name: 'Rifle',
            typeName: 'Ranged Weapons',
            characteristics: [
              { name: 'Range', $text: '24"' },
              { name: 'S', $text: '4' },
            ],
          },
        ],
      },
    ],
  })
  const vsProfiles = indexOf({
    'weapon-profile': { [`${unit}.rifle`]: record('Rifle', { unit, wargear: `${unit}.rifle`, ...RIFLE, strength: 5 }) },
  })
  const values = datasheetIn({ ...book, vsProfiles }, 'cat', 'entry')!.profiles[0]!.values
  expect(values).toEqual([
    { name: 'Range', value: '24"' },
    { name: 'S', value: '5' },
  ])
})

it('explains a keyword VS Data prints on a weapon by its ability, where the catalogue links it no rule', () => {
  const book = bookOf({
    selectionEntries: [
      {
        id: 'entry',
        name: 'Squad',
        type: 'unit',
        profiles: [
          { id: 'rifle-profile', name: 'Rifle', typeName: 'Ranged Weapons', characteristics: [{ name: 'Keywords', $text: 'Pistol' }] },
        ],
      },
    ],
  })
  const vsProfiles = indexOf({
    'weapon-profile': {
      [`${unit}.rifle`]: record('Rifle', { unit, wargear: `${unit}.rifle`, ...RIFLE, keywords: ['CLOSE-QUARTERS'] }),
    },
  })
  const sheet = datasheetIn({ ...book, vsProfiles, keywords: ['CLOSE-QUARTERS'] }, 'cat', 'entry')!
  expect(sheet.keywordRules).toEqual([{ name: 'CLOSE-QUARTERS', description: '' }])
})
