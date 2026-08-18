import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { loadFactionContents } from './datacards'

let directory: string | null = null

afterEach(() => {
  if (directory) fs.rmSync(directory, { recursive: true })
})

it('indexes the faction-owned datasheets and detachments', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'darkangels.json'),
    JSON.stringify({
      id: 'dark-angels',
      name: 'Dark Angels',
      datasheets: [
        {
          name: { en: 'Asmodai' },
          composition: [{ en: '**1 Asmodai**' }],
          loadout: { en: '**This model is equipped with:** Crozius arcanum.' },
          wargear: [{ en: 'This model cannot replace its wargear.' }],
          baseSize: { en: '50mm' },
          transport: { en: 'This model has a transport capacity of 6 **INFANTRY** models.' },
          points: [{ models: '1', cost: '70', keyword: null, faction: null, detachment: null }],
          attachesTo: [{ type: 'leader', target: 'Azrael', targetType: 'datasheet' }],
        },
        { name: { en: 'Azrael' } },
      ],
      detachments: [{ name: { en: 'Inner Circle Task Force' } }, { name: { en: 'Unforgiven Task Force' } }],
    }),
  )

  expect(loadFactionContents(directory).get('dark-angels')).toEqual({
    datasheets: new Set(['Asmodai', 'Azrael']),
    datasheetDetails: new Map([
      [
        'Asmodai',
        {
          composition: ['**1 Asmodai**'],
          loadout: '**This model is equipped with:** Crozius arcanum.',
          wargear: ['This model cannot replace its wargear.'],
          baseSize: '50mm',
          transport: 'This model has a transport capacity of 6 **INFANTRY** models.',
          points: [{ models: '1', cost: '70', keyword: null, faction: null, detachment: null }],
          attachesTo: [{ kind: 'leader', name: 'Azrael' }],
          leaders: [],
          supporters: [],
        },
      ],
      [
        'Azrael',
        {
          composition: [],
          loadout: null,
          wargear: [],
          baseSize: null,
          transport: null,
          points: [],
          attachesTo: [],
          leaders: ['Asmodai'],
          supporters: [],
        },
      ],
    ]),
    detachments: new Set(['Inner Circle Task Force', 'Unforgiven Task Force']),
  })
})

it('adds the diameter to named flying bases', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'aeldari.json'),
    JSON.stringify({
      name: 'Aeldari',
      datasheets: [
        { name: { en: 'Falcon' }, baseSize: { en: 'Large Flying Base' } },
        { name: { en: 'Farseer Skyrunner' }, baseSize: { en: 'Small Flying Base' } },
      ],
      detachments: [],
    }),
  )

  const details = loadFactionContents(directory).get('aeldari')?.datasheetDetails
  expect([details?.get('Falcon')?.baseSize, details?.get('Farseer Skyrunner')?.baseSize]).toEqual([
    'Large Flying Base (Ø60mm)',
    'Small Flying Base (Ø32mm)',
  ])
})
