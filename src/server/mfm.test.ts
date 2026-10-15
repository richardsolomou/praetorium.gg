import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { loadMfm, mfmAttribution, mfmCostRows, mfmEnhancementPoints, mfmPrice, type MfmIndex, type MfmUnit } from './mfm'

const sizedUnit: MfmUnit = {
  name: 'Squad',
  pricing: [
    {
      range: '[1,2]',
      costs: [
        { models: 3, points: 100 },
        { models: 6, points: 215 },
      ],
    },
    {
      range: '[3,)',
      costs: [
        { models: 3, points: 130 },
        { models: 6, points: 245 },
      ],
    },
  ],
}

it.each([
  [3, 1, 100],
  [4, 1, 215],
  [5, 2, 215],
  [6, 2, 215],
  [3, 3, 130],
  [4, 3, 245],
  [5, 3, 245],
  [6, 3, 245],
  [2, 1, null],
  [7, 1, null],
  [4, 0, null],
])('prices %i models in copy %i at %s points', (models, copy, expected) => {
  expect(mfmPrice(sizedUnit, models, copy)).toBe(expected)
})

it('does not infer intermediate sizes for a per-model price table', () => {
  expect(
    mfmPrice(
      {
        name: 'Squad',
        pricing: [
          {
            range: '[1,)',
            costs: [
              { models: 1, points: 40 },
              { models: 2, points: 80 },
              { models: 4, points: 160 },
            ],
          },
        ],
      },
      3,
      1,
    ),
  ).toBeNull()
})

it('refuses conflicting prices for the same model count', () => {
  expect(
    mfmPrice(
      {
        name: 'Squad',
        pricing: [
          {
            range: '[1,)',
            costs: [
              { models: 3, points: 100 },
              { models: 6, points: 215 },
              { models: 6, points: 220 },
            ],
          },
        ],
      },
      6,
      1,
    ),
  ).toBeNull()
})

it('prices intermediate squads independently of row order and add-on models', () => {
  expect(
    mfmPrice(
      {
        name: 'Squad',
        pricing: [
          {
            range: '[1,)',
            costs: [
              { models: 6, points: 215 },
              { models: 1, points: 10, addon: true },
              { models: 3, points: 100 },
            ],
          },
        ],
      },
      4,
      1,
    ),
  ).toBe(215)
})

it('refuses overlapping requisition tiers', () => {
  expect(mfmPrice({ ...sizedUnit, pricing: [sizedUnit.pricing[0]!, sizedUnit.pricing[0]!] }, 4, 1)).toBeNull()
})

it.each([
  ['[1,1]', 'Your 1st Unit Costs'],
  ['[2,2]', 'Your 2nd Unit Costs'],
  ['[3,3]', 'Your 3rd Unit Costs'],
  ['[4,4]', 'Your 4th Unit Costs'],
  ['[1,2]', 'Your 1st To 2nd Units Cost'],
  ['[1,3]', 'Your 1st To 3rd Units Cost'],
  ['[4,)', 'Your 4th + Unit Costs'],
  ['[11,13]', 'Your 11th To 13th Units Cost'],
  ['[21,23]', 'Your 21st To 23rd Units Cost'],
])('explains the unlabeled copy tier %s', (range, copies) => {
  expect(mfmCostRows({ name: 'Rhino', pricing: [{ range, costs: [{ models: 1, points: 70 }] }] })).toEqual([
    { models: '1', cost: '70', keyword: null, faction: null, detachment: null, copies },
  ])
})

it('keeps unrestricted prices free of copy conditions', () => {
  expect(mfmCostRows({ name: 'Rhino', pricing: [{ range: '[1,)', costs: [{ models: 1, points: 70 }] }] })).toEqual([
    { models: '1', cost: '70', keyword: null, faction: null, detachment: null },
  ])
})

it('retains a source label for a copy tier', () => {
  expect(
    mfmCostRows({ name: 'Rhino', pricing: [{ range: '[1,2]', label: 'First two units', costs: [{ models: 1, points: 70 }] }] })[0]?.copies,
  ).toBe('First two units')
})

it('loads authored attribution from a points file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-points-'))
  try {
    fs.mkdirSync(path.join(directory, 'points', 'data'), { recursive: true })
    fs.writeFileSync(
      path.join(directory, 'points', 'data', 'preview.yaml'),
      'slug: preview\nversion: community\nattribution: Community preview points\nunits: []\n',
    )
    expect(mfmAttribution(loadMfm(directory))).toBe('Community preview points')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it.each(['1.4', '1.5'])('attributes MFM %s points to their source version', (version) => {
  const index: MfmIndex = new Map([['necrons', { slug: 'necrons', version, units: [] }]])

  expect(mfmAttribution(index)).toBe(`Points from BSData Munitorum Field Manual ${version}`)
})

it('does not claim one version when faction files disagree', () => {
  const index: MfmIndex = new Map([
    ['necrons', { slug: 'necrons', version: '1.4', units: [] }],
    ['space-marines', { slug: 'space-marines', version: '1.5', units: [] }],
  ])

  expect(mfmAttribution(index)).toBe('Points from BSData Munitorum Field Manual')
})

it('retains authored points attribution alongside inherited MFM factions', () => {
  const index: MfmIndex = new Map([
    ['necrons', { slug: 'necrons', version: '1.5', units: [] }],
    ['adeptus-custodes', { slug: 'adeptus-custodes', version: 'preview', attribution: 'Community Custodes preview points', units: [] }],
  ])

  expect(mfmAttribution(index)).toBe('Points from BSData Munitorum Field Manual 1.5. Community Custodes preview points')
})

it('attributes an entirely authored dataset without claiming it is MFM', () => {
  const index: MfmIndex = new Map([
    ['adeptus-custodes', { slug: 'adeptus-custodes', version: 'preview', attribution: 'Community Custodes preview points', units: [] }],
  ])

  expect(mfmAttribution(index)).toBe('Community Custodes preview points')
})

it.each([
  ['Augury Uplink (Upgrade)', 30],
  ['Auriferous Orb', 20],
])('prices the %s enhancement from a row with printed qualifiers', (name, points) => {
  const detachment = {
    name: 'Might of the Moritoi',
    dp: 1,
    enhancements: [
      { name: 'Augury Uplink (one per army) (Upgrade)', points: 30 },
      { name: 'Auriferous Orb (Aura)', points: 20 },
    ],
  }
  expect(mfmEnhancementPoints(detachment, name)).toBe(points)
})
