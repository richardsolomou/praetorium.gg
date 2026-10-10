import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { loadMfm, mfmAttribution, type MfmIndex } from './mfm'

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
