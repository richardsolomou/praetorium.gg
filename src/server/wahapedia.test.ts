import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { descriptionKey, findDescription, loadWahapediaDescriptions } from './wahapedia'

let directory: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-wahapedia-'))
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('reads multiline HTML descriptions as plain text', () => {
  write('Stratagems.csv', 'name|detachment|description|\nCalculated Targeting|Cryptek Conclave|<b>WHEN:</b><br>After moving.|\n')
  write('Enhancements.csv', 'name|detachment|description|\n')
  expect(loadWahapediaDescriptions(directory)?.stratagems.get(descriptionKey('Cryptek Conclave', 'Calculated Targeting'))).toBe(
    'WHEN:\nAfter moving.',
  )
})

it('drops conflicting descriptions for the same rule', () => {
  write(
    'Stratagems.csv',
    'name|detachment|description|\nCalculated Targeting|Cryptek Conclave|First|\nCalculated Targeting|Cryptek Conclave|Second|\n',
  )
  write('Enhancements.csv', 'name|detachment|description|\n')
  expect(loadWahapediaDescriptions(directory)?.stratagems.has(descriptionKey('Cryptek Conclave', 'Calculated Targeting')) ?? false).toBe(
    false,
  )
})

it('matches an unambiguous spelling difference within one detachment', () => {
  const descriptions = new Map([[descriptionKey('Cursed Legion', 'Mark of the Nekrosor'), 'Add 1 to the Hit roll.']])
  expect(findDescription(descriptions, 'Cursed Legion', 'Mask of the Nekrosor')).toBe('Add 1 to the Hit roll.')
})

it('does not choose between similar names', () => {
  const descriptions = new Map([
    [descriptionKey('Cursed Legion', 'Mark of the Nekrosor'), 'First'],
    [descriptionKey('Cursed Legion', 'Murk of the Nekrosor'), 'Second'],
  ])
  expect(findDescription(descriptions, 'Cursed Legion', 'Mask of the Nekrosor')).toBeNull()
})

it('does not match across detachments', () => {
  const descriptions = new Map([[descriptionKey('Other Legion', 'Mark of the Nekrosor'), 'Wrong detachment']])
  expect(findDescription(descriptions, 'Cursed Legion', 'Mask of the Nekrosor')).toBeNull()
})

const write = (name: string, contents: string) => fs.writeFileSync(path.join(directory, name), contents)
