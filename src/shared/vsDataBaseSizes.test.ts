import { expect, it } from 'vitest'
import { baseSizeText, baseSizesByEntry } from './vsDataBaseSizes'
import type { VsDataUnit } from './vsData'

it.each<[string, VsDataUnit['bases'], string | null]>([
  ['a round base', [{ size: { diameter: 32 } }], '32mm'],
  ['an approximate oval base', [{ size: { length: 60, width: 35.5, approximate: true } }], '~60x35.5mm Oval Base'],
  ['a named flying base', [{ size: { flyingBase: 'large' } }], 'Large Flying Base (Ø60mm)'],
  ['a hull', [{ size: 'hull' }], 'Hull'],
  ['sizes the sources leave to the player', [{ size: { alternatives: [{ diameter: 32 }, { diameter: 40 }] } }], '32mm, 40mm'],
  [
    'each stat line’s models',
    [
      { models: ['Aestred Thurga'], size: { diameter: 32 } },
      { models: ['Agathae Dolan'], size: { diameter: 25 } },
    ],
    'Aestred Thurga: 32mm\nAgathae Dolan: 25mm',
  ],
  [
    'each model of one stat line',
    [
      {
        size: {
          byModel: [
            { models: ['Nodebeast'], size: { diameter: 28.5 } },
            { models: ['Neurogaunt'], size: { diameter: 25 } },
          ],
        },
      },
    ],
    'Nodebeast: 28.5mm\nNeurogaunt: 25mm',
  ],
  [
    'a base some wargear changes',
    [{ size: { size: { diameter: 25 }, withWargear: [{ wargear: ['Transuranic arquebus'], size: { length: 60, width: 35.5 } }] } }],
    '25mm\nTransuranic arquebus: 60x35.5mm Oval Base',
  ],
  [
    'one base for stat lines that share it',
    [
      { models: ['Dark Reaper'], size: { diameter: 28.5 } },
      { models: ['Dark Reaper Exarch'], size: { diameter: 28.5 } },
    ],
    '28.5mm',
  ],
  [
    'a base one model’s wargear changes',
    [
      {
        size: {
          byModel: [
            { models: ['Sergeant'], size: { diameter: 32 } },
            { models: ['Trooper'], size: { size: { diameter: 25 }, withWargear: [{ wargear: ['Heavy gun'], size: { diameter: 40 } }] } },
          ],
        },
      },
    ],
    'Sergeant: 32mm\nTrooper: 25mm\nTrooper with Heavy gun: 40mm',
  ],
  ['no base where no source prints one', [{ size: null }], null],
  [
    'no base where any stat line has none',
    [
      { models: ['Sergeant'], size: { diameter: 32 } },
      { models: ['Hound'], size: null },
    ],
    null,
  ],
])('shows %s', (_, bases, text) => {
  expect(baseSizeText(bases)).toBe(text)
})

it('gives each BSData entry its VS Data unit’s base', () => {
  const release = {
    units: { 'aeldari.falcon': { sizes: [1], models: [], options: [], bases: [{ size: { flyingBase: 'large' as const } }] } },
    entries: { 'unit:aeldari.falcon': ['bsdata.0b2e.ab25.9a8a.82b9', 'gdc.datasheet.falcon'] },
  }
  expect(baseSizesByEntry(release)).toEqual({ '0b2e-ab25-9a8a-82b9': 'Large Flying Base (Ø60mm)' })
})
