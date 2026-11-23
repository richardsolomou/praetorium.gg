import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { vsDataReleaseFiles, writeFiles } from './vsData.fixtures'
import { checkVsDataRelease, vsDataReleaseErrors } from './vsDataRelease'

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
