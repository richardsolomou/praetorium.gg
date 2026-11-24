import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { vsDataReleaseFiles, writeFiles } from './vsData.fixtures'
import { checkVsDataRelease, compactVsDataRelease, vsDataReleaseErrors } from './vsDataRelease'

const record = { kind: 'ability', id: 'necrons.test.phase-shift', aliases: [], summary: 'Move one unit.' }
let directory: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-data-release-'))
  writeFiles(directory, vsDataReleaseFiles([record]))
})
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('accepts a release holding exactly what its manifest lists', () => {
  expect(vsDataReleaseErrors(directory)).toEqual([])
})

it('refuses a record whose bytes differ from the manifest', () => {
  fs.appendFileSync(path.join(directory, 'records/rules-reference/ability/necrons.test.phase-shift.json'), ' ')
  expect(vsDataReleaseErrors(directory)).toEqual(['records/rules-reference/ability/necrons.test.phase-shift.json: checksum mismatch'])
})

it('refuses a file the manifest does not list', () => {
  fs.writeFileSync(path.join(directory, 'records/extra.json'), '{}')
  expect(vsDataReleaseErrors(directory)).toEqual(['records/extra.json: not listed in the manifest'])
})

it('refuses a symbolic link inside the release', () => {
  fs.symlinkSync('/etc/hosts', path.join(directory, 'records/link.json'))
  expect(vsDataReleaseErrors(directory)).toEqual(['records/link.json: not a regular file'])
})

it('refuses a release for an MFM no rules version plays', () => {
  fs.rmSync(directory, { recursive: true })
  writeFiles(directory, vsDataReleaseFiles([record], 'MFM 1.5'))
  expect(() => checkVsDataRelease(directory, [{ id: 'mfm-1-6', name: 'MFM 1.6' }])).toThrow(
    'describes 11th MFM 1.5, which no rules version plays',
  )
})

it('keeps the credit each adapted record names, once', () => {
  const credit = {
    credit: 'A data project',
    url: 'https://example.com/data',
    licence: 'https://creativecommons.org/licenses/by/4.0/legalcode',
  }
  fs.rmSync(directory, { recursive: true })
  writeFiles(
    directory,
    vsDataReleaseFiles([
      { ...record, attribution: credit },
      { ...record, id: 'necrons.test.other', attribution: credit },
    ]),
  )
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).attributions).toEqual([credit])
})

it('keeps what a datasheet shows of a unit, its models and wargear named, under its BSData alias', () => {
  const roster = (kind: string, id: string, data: unknown, name = id) => ({ kind, id, name, aliases: [], category: 'rosters', data })
  const files = vsDataReleaseFiles([
    record,
    { ...roster('unit', 'necrons.ghost-ark', { sizes: [1] }), aliases: ['bsdata.aa11.bb22'] },
    roster(
      'model',
      'necrons.ghost-ark.ghost-ark',
      { unit: 'necrons.ghost-ark', min: 1, max: 1, wargear: { 'necrons.ghost-ark.gauss-flayer-array': 2 } },
      'Ghost Ark',
    ),
    roster('wargear', 'necrons.ghost-ark.gauss-flayer-array', {}, 'Gauss flayer array'),
    {
      kind: 'transport-profile',
      id: 'necrons.ghost-ark',
      aliases: [],
      category: 'profiles',
      data: { unit: 'necrons.ghost-ark', capacity: { loads: [[{ count: 'models', limit: 10, selectors: ['NECRON WARRIORS'] }]] } },
    },
  ])
  fs.rmSync(directory, { recursive: true })
  writeFiles(directory, files)
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect([compact.entries['unit:necrons.ghost-ark'], compact.units['necrons.ghost-ark']]).toEqual([
    ['bsdata.aa11.bb22'],
    {
      sizes: [1],
      models: [{ name: 'Ghost Ark', min: 1, max: 1, wargear: [['Gauss flayer array', 2]] }],
      options: [],
      transport: { loads: [[{ count: 'models', limit: 10, selectors: ['NECRON WARRIORS'] }]] },
    },
  ])
})

it('reads a complete record with no summary of its own, as a mission card is, as having none', () => {
  fs.rmSync(directory, { recursive: true })
  writeFiles(directory, vsDataReleaseFiles([record, { ...record, id: 'necrons.test.card', data: { text: 'none' } }]))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).records.map(({ id }: { id: string }) => id)).toEqual(['necrons.test.phase-shift'])
})

it('reads a record whose summary VS Data holds as unresolved as having none', () => {
  fs.rmSync(directory, { recursive: true })
  writeFiles(
    directory,
    vsDataReleaseFiles([
      record,
      { ...record, id: 'necrons.test.held', data: { summary: { unresolved: 'Repeated the official wording.' } } },
    ]),
  )
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).records.map(({ id }: { id: string }) => id)).toEqual(['necrons.test.phase-shift'])
})
